import fs from "node:fs/promises";
import path from "node:path";

// PUBLIC_INTERFACE
/**
 * Writes a JSON artifact to disk, creating its parent directory if necessary.
 *
 * @param {string} filePath - Absolute output file path.
 * @param {unknown} payload - JSON-serializable data to persist.
 * @returns {Promise<string>} The absolute path that was written.
 */
export async function writeJsonArtifact(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}

// PUBLIC_INTERFACE
/**
 * Reads and parses a JSON artifact from disk.
 *
 * @param {string} filePath - Absolute artifact path to read.
 * @returns {Promise<unknown>} Parsed JSON artifact content.
 */
export async function readJsonArtifact(filePath) {
  const rawContent = await fs.readFile(filePath, "utf8");
  return JSON.parse(rawContent);
}

// PUBLIC_INTERFACE
/**
 * Writes a plain-text artifact to disk, creating its parent directory if necessary.
 *
 * @param {string} filePath - Absolute output file path.
 * @param {string} content - Text content to persist.
 * @returns {Promise<string>} The absolute path that was written.
 */
export async function writeTextArtifact(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

// PUBLIC_INTERFACE
/**
 * Reads a plain-text artifact from disk.
 *
 * @param {string} filePath - Absolute artifact path to read.
 * @returns {Promise<string>} The raw text content of the artifact.
 */
export async function readTextArtifact(filePath) {
  return fs.readFile(filePath, "utf8");
}

// PUBLIC_INTERFACE
/**
 * Appends one or more JSON-serializable records to a newline-delimited JSON artifact.
 *
 * @param {string} filePath - Absolute JSONL artifact path.
 * @param {unknown | unknown[]} payload - A single record or a list of records to append.
 * @returns {Promise<string>} The absolute path that was appended.
 */
export async function appendJsonLinesArtifact(filePath, payload) {
  const records = Array.isArray(payload) ? payload : [payload];
  const content = records.map((record) => JSON.stringify(record)).join("\n");

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  if (content.length > 0) {
    await fs.appendFile(filePath, `${content}\n`, "utf8");
  }

  return filePath;
}
