/**
 * MilestonePay backend entrypoint.
 * Starts the Hono API server and the chain event indexer in a single Bun process.
 *
 * Usage: bun run server/start.ts
 */

import './index'           // boots Hono server (migrate + serve)
import { startIndexer } from './indexer'

// Start indexer after a short delay to let migration complete
setTimeout(() => {
  startIndexer().catch(err => {
    console.error('[start] Indexer failed to start:', (err as Error).message)
  })
}, 3_000)
