import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson, StreamInspector } from '../src/lib/http';
const encode = (value:string)=>new TextEncoder().encode(value);
test('bounded JSON reader handles multibyte input and malformed bodies', async()=>{
 assert.deepEqual(await readJson(new Request('https://test',{method:'POST',body:'{"text":"こんにちは"}'})),{text:'こんにちは'});
 await assert.rejects(()=>readJson(new Request('https://test',{method:'POST',body:'{broken'})),{status:400});
 await assert.rejects(()=>readJson(new Request('https://test',{method:'POST',body:'"こんにちは"'}),10),{status:413});
 await assert.rejects(()=>readJson(new Request('https://test')), {status:400});
});
test('oversized chunked body is cancelled before fully buffering', async()=>{
 let cancelled=false;
 const stream=new ReadableStream({start(c){c.enqueue(encode('123456'));},cancel(){cancelled=true;}});
 const req=new Request('https://test',{method:'POST',body:stream,duplex:'half'} as RequestInit);
 await assert.rejects(()=>readJson(req,5),{status:413});assert.ok(cancelled);
});
test('SSE inspector handles chunk boundaries, CRLF, usage, and DONE without trailing newline',()=>{
 const inspector=new StreamInspector();
 for(const chunk of ['data: {"usage":{"total_','tokens":42}}\r\n\r\ndata: [DO','NE]']) inspector.push(encode(chunk));
 inspector.finish();assert.equal(inspector.tokens,42);assert.ok(inspector.done);
});
test('SSE inspector rejects truncated streams and provider error frames',()=>{
 const truncated=new StreamInspector();truncated.push(encode('data: {"choices":[]}\n\n'));
 assert.throws(()=>truncated.finish(),/Incomplete/);
 const error=new StreamInspector();error.push(encode('data: {"error":{"message":"unavailable"}}\n\ndata: [DONE]\n\n'));
 assert.throws(()=>error.finish(),/failed/);
});
