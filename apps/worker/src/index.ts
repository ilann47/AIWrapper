import pg from "pg";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const interval=Number(process.env.MAINTENANCE_INTERVAL_MS??30_000);
async function maintain(){await pool.query(`UPDATE quota_reservations SET status='expired' WHERE status='reserved' AND expires_at<now()`);await pool.query(`UPDATE requests SET status='error',finished_at=now(),error_code='worker_timeout' WHERE status IN ('queued','running') AND started_at<now()-interval '1 hour'`)}
const timer=setInterval(()=>void maintain().catch(error=>process.stderr.write(`${JSON.stringify({level:"error",component:"worker",message:(error as Error).message})}\n`)),interval);timer.unref();await maintain();
async function stop(){clearInterval(timer);await pool.end();process.exit(0)}process.once("SIGINT",()=>void stop());process.once("SIGTERM",()=>void stop());await new Promise(()=>{});
