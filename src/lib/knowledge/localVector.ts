import * as fs from "fs";
import * as path from "path";

export interface LocalVectorMetadata {
  sourceName: string;
  sourcePath: string;
  page?: number;
  section?: string;
  tags: string[];
  embeddingModel: string;
  generatedAt: string;
  extractionMode: string;
}

export interface LocalVectorChunk {
  id: string;
  text: string;
  embedding: number[];
  metadata: LocalVectorMetadata;
}

const EMBEDDING_DIMS = 384;
const DEFAULT_CHUNKS_PATH = path.join(
  process.cwd(),
  "knowledge",
  "generated",
  "public-knowledge-chunks.jsonl"
);

let cachedChunks: LocalVectorChunk[] | null = null;

const KEYWORD_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "you",
  "your",
  "have",
  "has",
  "are",
  "our",
  "rdc",
  "concrete",
  "ready",
  "mix",
  "readymix",
  "plant",
  "plants",
  "location",
  "locations",
  "address",
]);

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

export function embedText(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMS).fill(0);
  for (const token of tokenize(text)) {
    const hash = hashToken(token);
    vector[hash % EMBEDDING_DIMS] += hash & 1 ? 1 : -1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    aMagnitude += a[i] * a[i];
    bMagnitude += b[i] * b[i];
  }

  if (aMagnitude === 0 || bMagnitude === 0) return 0;
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

function keywordScore(query: string, text: string, metadata: LocalVectorMetadata): number {
  const normalizedQuery = query.toLowerCase().normalize("NFKC");
  const searchableText = `${text} ${metadata.sourceName} ${metadata.tags.join(" ")}`
    .toLowerCase()
    .normalize("NFKC");
  const searchableTokens = new Set(searchableText.split(/[^\p{L}\p{N}]+/u).filter(Boolean));

  const queryTokens = normalizedQuery
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 2)
    .filter((token) => !KEYWORD_STOP_WORDS.has(token));

  if (!queryTokens.length) return 0;

  let score = 0;
  for (const token of new Set(queryTokens)) {
    if (searchableTokens.has(token)) score += token.length >= 5 ? 0.22 : 0.12;
  }

  const meaningfulPhrase = normalizedQuery
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 2 && !KEYWORD_STOP_WORDS.has(token))
    .join(" ");
  if (meaningfulPhrase && searchableText.includes(meaningfulPhrase)) score += 0.3;

  return Math.min(score, 1);
}

export function loadLocalVectorChunks(): LocalVectorChunk[] {
  if (cachedChunks) return cachedChunks;

  const chunksPath =
    process.env.LOCAL_VECTOR_PATH || process.env.VISION_TEST_VECTOR_PATH || DEFAULT_CHUNKS_PATH;
  if (!fs.existsSync(chunksPath)) {
    cachedChunks = [];
    return cachedChunks;
  }

  const raw = fs.readFileSync(chunksPath, "utf-8").trim();
  if (!raw) {
    cachedChunks = [];
    return cachedChunks;
  }

  cachedChunks = raw
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as LocalVectorChunk)
    .filter((chunk) => Array.isArray(chunk.embedding) && Boolean(chunk.text));

  return cachedChunks;
}

export function searchLocalVectors(
  query: string,
  options: { topK?: number; minSimilarity?: number } = {}
): Array<LocalVectorChunk & { similarity: number; keywordScore: number; rankingScore: number }> {
  if (process.env.USE_LOCAL_VECTOR_DB === "false" || process.env.USE_VISION_TEST_VECTOR === "false") return [];

  const topK = options.topK ?? 8;
  const minSimilarity =
    options.minSimilarity ?? Number(process.env.VISION_VECTOR_MIN_SIMILARITY || 0.12);
  const queryEmbedding = embedText(query);

  return loadLocalVectorChunks()
    .map((chunk) => {
      const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
      const lexicalScore = keywordScore(query, chunk.text, chunk.metadata);
      return {
        ...chunk,
        similarity,
        keywordScore: lexicalScore,
        rankingScore: similarity + lexicalScore,
      };
    })
    .filter((chunk) => chunk.similarity >= minSimilarity || chunk.keywordScore > 0)
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .slice(0, topK);
}
