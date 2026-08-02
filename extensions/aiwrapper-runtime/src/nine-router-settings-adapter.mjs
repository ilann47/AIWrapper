/**
 * AIWrapper integration boundary for 9router's original settings repository.
 * The original Node 22 SQLite adapter remains the executing implementation;
 * this module only binds it to AIWrapper's canonical database file.
 */
import { createNodeSqliteAdapter } from "../../../upstream/9router/src/lib/db/adapters/nodeSqliteAdapter.js";

let adapterPromise;

export async function getAdapter() {
  if (!adapterPromise) {
    adapterPromise = createNodeSqliteAdapter(process.env.AIWRAPPER_DATABASE_PATH || ".aiwrapper/aiwrapper.db")
      .then((adapter) => {
        adapter.exec("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)");
        return adapter;
      });
  }
  return adapterPromise;
}
