import { ApiError } from './security';

/** Enforce byte limits while reading, rather than after buffering an untrusted body. */
export async function readJson(req: Request, limit = 2_000_000): Promise<unknown> {
 const declared = req.headers.get('content-length');
 if (declared && Number(declared) > limit) throw new ApiError(413, 'Request too large');
 const reader = req.body?.getReader();
 if (!reader) throw new ApiError(400, 'JSON body required');
 const chunks: Uint8Array[] = [];
 let size = 0;
 try {
  while (true) {
   const { done, value } = await reader.read();
   if (done) break;
   size += value.byteLength;
   if (size > limit) { await reader.cancel(); throw new ApiError(413, 'Request too large'); }
   chunks.push(value);
  }
 } finally { reader.releaseLock(); }
 const bytes = new Uint8Array(size);
 let offset = 0;
 for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
 try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
 catch { throw new ApiError(400, 'Invalid JSON'); }
}

/** Incremental SSE inspection without changing forwarded bytes. */
export class StreamInspector {
 private decoder = new TextDecoder();
 private pending = '';
 done = false;
 failed = false;
 tokens = 0;
 push(bytes: Uint8Array) {
  this.pending += this.decoder.decode(bytes, { stream: true });
  const lines = this.pending.split('\n');
  this.pending = lines.pop() ?? '';
  for (const line of lines) this.line(line);
  if (this.pending.length > 1_000_000) throw new Error('Upstream SSE frame too large');
 }
 finish() {
  this.pending += this.decoder.decode();
  if (this.pending) this.line(this.pending);
  if (!this.done || this.failed) throw new Error('Incomplete or failed upstream stream');
 }
 private line(line: string) {
  if (!line.startsWith('data:')) return;
  const value = line.slice(5).trim();
  if (value === '[DONE]') { this.done = true; return; }
  try {
   const frame = JSON.parse(value);
   if (frame.error) this.failed = true;
   const count = frame.usage?.total_tokens;
   if (Number.isSafeInteger(count) && count >= 0) this.tokens = count;
  } catch { /* Ignore non-JSON extension frames. */ }
 }
}
