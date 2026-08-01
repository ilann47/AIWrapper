import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api.js";
import "./styles.css";

type Summary = { users:number; activeRequests:number; queueDepth:number; blocked:number; weightedUnits:number; estimatedCostMicros:number };
type UsageRow = { user:string; model:string; backend:string; requests:number; weightedUnits:number; costMicros:number; errors:number };
type AuditRow = { id:string; event:string; targetType:string; createdAt:string; metadata:Record<string,unknown> };

function App(){
 const [token,setToken]=useState(sessionStorage.getItem("adminToken")??""); const [summary,setSummary]=useState<Summary>(); const [usage,setUsage]=useState<UsageRow[]>([]); const [audit,setAudit]=useState<AuditRow[]>([]); const [error,setError]=useState("");
 async function load(){try{api.setToken(token); const [s,u,a]=await Promise.all([api.get<Summary>("/admin/summary"),api.get<{data:UsageRow[]}>("/admin/usage?limit=50"),api.get<{data:AuditRow[]}>("/admin/audit?limit=50")]);setSummary(s);setUsage(u.data);setAudit(a.data);setError("")}catch(e){setError(String(e))}}
 useEffect(()=>{if(token)void load(); const timer=setInterval(()=>{if(token)void load()},5000);return()=>clearInterval(timer)},[token]);
 if(!summary)return <main className="login"><section><h1>AIWrapper</h1><p>Administração da plataforma</p><input type="password" value={token} onChange={e=>setToken(e.target.value)} placeholder="Admin API key"/><button onClick={load}>Entrar</button>{error&&<pre>{error}</pre>}</section></main>;
 return <div className="shell"><aside><h1>AIWrapper</h1>{["Visão geral","Usuários","API keys","Perfis","Cotas e ciclos","Backends","Auditoria"].map(x=><button key={x}>{x}</button>)}</aside><main><header><div><h2>Visão geral</h2><span>Atualização automática a cada 5s</span></div><button onClick={load}>Atualizar</button></header><div className="cards"><Card label="Usuários" value={summary.users}/><Card label="Requisições ativas" value={summary.activeRequests}/><Card label="Fila" value={summary.queueDepth}/><Card label="Bloqueios" value={summary.blocked}/><Card label="Unidades" value={summary.weightedUnits.toLocaleString()}/><Card label="Custo estimado" value={`$${(summary.estimatedCostMicros/1e6).toFixed(2)}`}/></div><Panel title="Consumo"><table><thead><tr><th>Usuário</th><th>Modelo</th><th>Backend</th><th>Requests</th><th>Unidades</th><th>Erros</th></tr></thead><tbody>{usage.map((r,i)=><tr key={i}><td>{r.user}</td><td>{r.model}</td><td>{r.backend}</td><td>{r.requests}</td><td>{r.weightedUnits.toLocaleString()}</td><td>{r.errors}</td></tr>)}</tbody></table></Panel><Panel title="Auditoria"><table><thead><tr><th>Evento</th><th>Alvo</th><th>Data</th></tr></thead><tbody>{audit.map(r=><tr key={r.id}><td>{r.event}</td><td>{r.targetType}</td><td>{new Date(r.createdAt).toLocaleString()}</td></tr>)}</tbody></table></Panel></main></div>
}
function Card({label,value}:{label:string,value:string|number}){return <section className="card"><span>{label}</span><strong>{value}</strong></section>}; function Panel({title,children}:{title:string,children:React.ReactNode}){return <section className="panel"><h3>{title}</h3>{children}</section>}
createRoot(document.getElementById("root")!).render(<App/>);
