export type Model = { name: string; version: number; base_model: string; system_prompt: string; parameters: Record<string, unknown>; priority: number };
export type Rule = { alias: string; model_name: string; task_pattern: string; priority: number };
export type Node = { id: string; url: string; models: string[]; priority: number; last_heartbeat: string };
export function resolveModels(requested: string, text: string, models: Model[], rules: Rule[]) {
 const latest = [...new Map([...models].sort((a,b)=>a.version-b.version).map(m=>[m.name,m])).values()];
 const matching = rules.filter(r=>r.alias===requested && (!r.task_pattern || text.toLowerCase().includes(r.task_pattern.toLowerCase()))).sort((a,b)=>b.priority-a.priority);
 const version = requested.match(/^(.*)@v(\d+)$/);
 if(version) return models.filter(m=>m.name===version[1] && m.version===Number(version[2]));
 if(matching.length) return matching.flatMap(r=>latest.filter(m=>m.name===r.model_name));
 return latest.filter(m=>m.name===requested).sort((a,b)=>b.priority-a.priority);
}
export function healthyNodes(nodes: Node[], base: string, now=Date.now()) {
 return nodes.filter(n=>now-new Date(n.last_heartbeat).getTime()<30000 && n.models.includes(base)).sort((a,b)=>b.priority-a.priority);
}
export function fallbacks() {
 return [
  { name:'groq', url:'https://api.groq.com/openai/v1', key:process.env.GROQ_API_KEY, model:process.env.GROQ_MODEL || 'llama-3.3-70b-versatile' },
  { name:'openrouter', url:'https://openrouter.ai/api/v1', key:process.env.OPENROUTER_API_KEY, model:process.env.OPENROUTER_MODEL || 'openrouter/free' },
  { name:'huggingface', url:'https://router.huggingface.co/v1', key:process.env.HF_TOKEN, model:process.env.HF_MODEL || 'Qwen/Qwen2.5-7B-Instruct' }
 ].filter(p=>p.key);
}
