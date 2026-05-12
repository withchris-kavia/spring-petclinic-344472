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
