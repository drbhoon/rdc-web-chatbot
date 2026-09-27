export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export async function embedTexts(input: string[]): Promise<number[][]> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Embeddings API key is missing");
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, input }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Embedding service returned ${response.status}`);
  const data = await response.json();
  const vectors = data.data.sort((a: {index: number}, b: {index: number}) => a.index - b.index)
    .map((item: { embedding: number[] }) => item.embedding);
  if (vectors.length !== input.length || vectors.some((v: number[]) => v.length !== EMBEDDING_DIMENSIONS || v.some(n => !Number.isFinite(n)))) {
    throw new Error("Invalid embedding response");
  }
  return vectors;
}

export function vectorLiteral(vector: number[]): string {
  if (vector.length !== EMBEDDING_DIMENSIONS || vector.some(n => !Number.isFinite(n))) throw new Error("Invalid vector");
  return `[${vector.join(",")}]`;
}
