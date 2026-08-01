import pg from "pg";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createApiKey } from "../../auth/src/api-keys.js";
const databaseUrl=process.env.DATABASE_URL,pepper=process.env.API_KEY_PEPPER;
if(!databaseUrl||!pepper)throw new Error("DATABASE_URL and API_KEY_PEPPER are required");
const name=process.argv[2]??"owner", codexHome=resolve(process.argv[3]??process.env.CODEX_HOME??".codex-owner");
const pool=new pg.Pool({connectionString:databaseUrl,max:1});
try{const client=await pool.connect();try{await client.query("BEGIN");const user=(await client.query(`INSERT INTO users(name,role) VALUES($1,'owner') ON CONFLICT(name) DO UPDATE SET role='owner',status='active' RETURNING id`,[name])).rows[0];await client.query(`INSERT INTO profiles(user_id,name,codex_home,backend_id,config) VALUES($1,'default',$2,'codex-chatgpt',$3) ON CONFLICT(user_id,name) DO UPDATE SET codex_home=excluded.codex_home,status='active'`,[user.id,codexHome,{cwd:process.cwd()}]);const created=createApiKey(user.id,pepper);await client.query(`INSERT INTO api_keys(id,user_id,prefix,digest,status,created_at) VALUES($1,$2,$3,$4,'active',$5)`,[created.record.id,user.id,created.record.prefix,created.record.digest,created.record.createdAt]);await client.query(`INSERT INTO audit_events(actor_user_id,event,target_type,target_id) VALUES($1,'owner.bootstrapped','user',$1)`,[user.id]);await client.query("COMMIT");process.stdout.write(`Owner API key (shown once): ${created.secret}\nCODEX_HOME: ${codexHome}\n`)}catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}}finally{await pool.end()}
