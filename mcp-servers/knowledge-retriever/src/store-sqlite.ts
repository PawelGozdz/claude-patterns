// sqlite-vec store — for the CODE corpus (large: 6800+ files → many chunks).
// Embedded (one .db file, in-process), KNN via sqlite-vec vec0 (cosine). Phase 2 of rag-design.
// Vectors are L2-normalized by the embedder; we use distance_metric=cosine.
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Chunk, Hit } from "./types.js";

export class SqliteVecStore {
  private db: Database.Database;
  private dim = 0;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    sqliteVec.load(this.db);
    this.db.exec(`CREATE TABLE IF NOT EXISTS chunks (
      rowid INTEGER PRIMARY KEY,
      id TEXT UNIQUE, source TEXT, section TEXT, text TEXT, start_line INT, end_line INT
    )`);
  }

  private ensureVec(dim: number): void {
    if (this.dim) return;
    this.dim = dim;
    this.db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(embedding float[${dim}] distance_metric=cosine)`
    );
  }

  clear(): void {
    this.db.exec(`DELETE FROM chunks`);
    try {
      this.db.exec(`DELETE FROM vec_chunks`);
    } catch {
      /* vec table may not exist yet */
    }
  }

  add(chunks: Chunk[]): void {
    const withVec = chunks.filter((c) => c.vector);
    if (!withVec.length) return;
    this.ensureVec(withVec[0].vector!.length);
    const insMeta = this.db.prepare(
      `INSERT OR REPLACE INTO chunks (id, source, section, text, start_line, end_line) VALUES (?,?,?,?,?,?)`
    );
    const insVec = this.db.prepare(`INSERT INTO vec_chunks (rowid, embedding) VALUES (?, ?)`);
    const tx = this.db.transaction((cs: Chunk[]) => {
      for (const c of cs) {
        const info = insMeta.run(c.id, c.source, c.section, c.text, c.startLine ?? null, c.endLine ?? null);
        insVec.run(info.lastInsertRowid as number, JSON.stringify(c.vector));
      }
    });
    tx(withVec);
  }

  search(queryVec: number[], k: number): Hit[] {
    const rows = this.db
      .prepare(
        `SELECT c.source, c.section, c.text, c.start_line AS startLine, c.end_line AS endLine, m.distance
         FROM (SELECT rowid, distance FROM vec_chunks WHERE embedding MATCH ? AND k = ?) m
         JOIN chunks c ON c.rowid = m.rowid
         ORDER BY m.distance`
      )
      .all(JSON.stringify(queryVec), k) as any[];
    return rows.map((r) => ({
      source: r.source,
      section: r.section,
      text: r.text,
      startLine: r.startLine ?? undefined,
      endLine: r.endLine ?? undefined,
      score: 1 - r.distance,
    }));
  }

  close(): void {
    this.db.close();
  }
}
