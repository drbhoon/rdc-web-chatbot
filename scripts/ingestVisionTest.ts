/**
 * Build a temporary local vector corpus for Vision 2030 testing.
 *
 * Run:
 *   npm run ingest:vision-test
 *
 * Optional:
 *   VISION_PYTHON="path/to/python" npm run ingest:vision-test
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface ExtractedPdf {
  path: string;
  pages: Array<{ page: number; text: string }>;
  textChars: number;
  ocrAttempted: boolean;
  ocrAvailable: boolean;
  warnings: string[];
}

interface VisionChunk {
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
    extractionMode: "pdf-text" | "image-manual" | "metadata-placeholder";
  };
}

const SOURCES = {
  rdcVision: {
    title: "RDC Vision 2030",
    path: "D:\\RDC Drive\\BD\\Vision 2030\\RDC Vision 2030.pdf",
    tags: ["vision_2030", "strategy", "growth", "operations"],
  },
  rmcPlaybook: {
    title: "RMC India Strategy and Economic Playbook",
    path: "D:\\RDC Drive\\BD\\Vision 2030\\RMC_India_Strategy_and_Economic_Playbook.pdf",
    tags: ["rmc_market", "strategy", "economic_playbook", "india"],
  },
  technologyMap: {
    title: "Technology Map - RDC",
    path: "D:\\RDC Drive\\BD\\Vision 2030\\Technology Map- RDC.png",
    tags: ["technology", "digital_initiatives", "operations", "vision_2030"],
  },
};

const GENERATED_DIR = path.join(process.cwd(), "knowledge", "generated");
const CHUNKS_PATH = path.join(GENERATED_DIR, "vision-test-chunks.jsonl");
const INDEX_PATH = path.join(GENERATED_DIR, "vision-test-index.json");
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
    const index = hash % EMBEDDING_DIMS;
    vector[index] += hash & 1 ? 1 : -1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
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
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = Math.max(0, end - overlapChars);
  }
  return chunks.filter((chunk) => chunk.length > 80);
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
    const check = spawnSync(candidate, ["-c", "import pypdf"], {
      encoding: "utf-8",
      timeout: 10000,
    });
    if (check.status === 0) return candidate;
  }

  return candidates[0] || "python";
}

function extractPdf(pdfPath: string): ExtractedPdf {
  const extractorPath = path.join(process.cwd(), "scripts", "extractVisionPdfText.py");
  const result = spawnSync(resolvePython(), [extractorPath, pdfPath], {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.error) {
    return {
      path: pdfPath,
      pages: [],
      textChars: 0,
      ocrAttempted: false,
      ocrAvailable: false,
      warnings: [`Python extraction failed: ${result.error.message}`],
    };
  }

  try {
    return JSON.parse(result.stdout || "{}") as ExtractedPdf;
  } catch {
    return {
      path: pdfPath,
      pages: [],
      textChars: 0,
      ocrAttempted: false,
      ocrAvailable: false,
      warnings: [`Could not parse extractor output: ${result.stderr || result.stdout}`],
    };
  }
}

function makeChunk(
  id: string,
  text: string,
  metadata: Omit<VisionChunk["metadata"], "embeddingModel" | "generatedAt">
): VisionChunk {
  return {
    id,
    text,
    embedding: embedText(text),
    metadata: {
      ...metadata,
      embeddingModel: EMBEDDING_MODEL,
      generatedAt: new Date().toISOString(),
    },
  };
}

function ingestPdfSource(
  sourceKey: string,
  sourceName: string,
  sourcePath: string,
  tags: string[]
): { chunks: VisionChunk[]; warnings: string[]; textChars: number; pages: number } {
  const extracted = extractPdf(sourcePath);
  const chunks: VisionChunk[] = [];

  const pages = Array.isArray(extracted.pages) ? extracted.pages : [];

  for (const page of pages) {
    const pageChunks = splitIntoChunks(page.text);
    pageChunks.forEach((text, index) => {
      chunks.push(
        makeChunk(`${sourceKey}-p${page.page}-${index + 1}`, text, {
          sourceName,
          sourcePath,
          page: page.page,
          tags,
          extractionMode: "pdf-text",
        })
      );
    });
  }

  if (chunks.length === 0) {
    const placeholderText = [
      `${sourceName} is part of the temporary RDC Vision 2030 test corpus.`,
      "The file appears to be scanned or image-only in this environment, so searchable text could not be extracted without OCR.",
      "Use this placeholder only to identify that the document exists; do not treat it as detailed source evidence until OCR is configured.",
    ].join(" ");

    chunks.push(
      makeChunk(`${sourceKey}-metadata-placeholder`, placeholderText, {
        sourceName,
        sourcePath,
        section: "metadata-placeholder",
        tags,
        extractionMode: "metadata-placeholder",
      })
    );
  }

  return {
    chunks,
    warnings: extracted.warnings || [],
    textChars: extracted.textChars || 0,
    pages: pages.length,
  };
}

function ingestTechnologyMap(): VisionChunk[] {
  const source = SOURCES.technologyMap;
  const text = [
    "RDC Technology Map: Building the future with digital precision.",
    "The map places RDC Customer Connect under online order management, QMS under QA and QC, RDCTRAK under outbound logistics, and Integration with ERP under process control.",
    "It also lists online weighbridge for inbound logistics, automatic silo weighing system for storage management, automatic aggregate measurement system for stock management, and unmanned production system for production management.",
    "People and support systems include My Setu for health and safety, Deeksha as the e-learning platform, and HRIS for human resource management.",
    "The stated theme is that all digital initiatives are AI enabled, supporting integrated operations from inbound logistics and storage to ordering, production, quality, outbound delivery, HR, safety, and learning.",
  ].join(" ");

  return [
    makeChunk("technology-map-rdc-digital-initiatives", text, {
      sourceName: source.title,
      sourcePath: source.path,
      section: "image-visible-text",
      tags: source.tags,
      extractionMode: "image-manual",
    }),
  ];
}

function main() {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  const results = [
    ingestPdfSource("rdc-vision-2030", SOURCES.rdcVision.title, SOURCES.rdcVision.path, SOURCES.rdcVision.tags),
    ingestPdfSource("rmc-india-playbook", SOURCES.rmcPlaybook.title, SOURCES.rmcPlaybook.path, SOURCES.rmcPlaybook.tags),
  ];

  const chunks = [
    ...results.flatMap((result) => result.chunks),
    ...ingestTechnologyMap(),
  ];

  fs.writeFileSync(
    CHUNKS_PATH,
    chunks.map((chunk) => JSON.stringify(chunk)).join("\n") + "\n",
    "utf-8"
  );

  const index = {
    generatedAt: new Date().toISOString(),
    embeddingModel: EMBEDDING_MODEL,
    embeddingDims: EMBEDDING_DIMS,
    chunkCount: chunks.length,
    chunksPath: CHUNKS_PATH,
    sources: [
      {
        ...SOURCES.rdcVision,
        pages: results[0].pages,
        extractedTextChars: results[0].textChars,
        chunkCount: results[0].chunks.length,
        warnings: results[0].warnings,
      },
      {
        ...SOURCES.rmcPlaybook,
        pages: results[1].pages,
        extractedTextChars: results[1].textChars,
        chunkCount: results[1].chunks.length,
        warnings: results[1].warnings,
      },
      {
        ...SOURCES.technologyMap,
        pages: 1,
        extractedTextChars: 0,
        chunkCount: 1,
        warnings: ["Image text was added from visible/manual source text for this test corpus."],
      },
    ],
  };

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");

  console.log("RDC Vision test vector ingestion complete");
  console.log(`Chunks: ${chunks.length}`);
  console.log(`Chunks file: ${CHUNKS_PATH}`);
  console.log(`Index file: ${INDEX_PATH}`);
  for (const source of index.sources) {
    console.log(
      `- ${source.title}: ${source.chunkCount} chunk(s), ${source.extractedTextChars} extracted chars`
    );
    for (const warning of source.warnings) {
      console.warn(`  warning: ${warning}`);
    }
  }
}

main();
