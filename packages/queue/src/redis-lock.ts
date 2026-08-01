import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
const RELEASE=`if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end`;
export class RedisLease {
  constructor(private readonly redis: Redis, private readonly prefix="aiwrapper:lease:") {}
  async acquire(resource:string,ttlMs:number):Promise<undefined|(()=>Promise<void>)>{const key=this.prefix+resource,token=randomUUID();if(await this.redis.set(key,token,"PX",ttlMs,"NX")!=="OK")return;return async()=>{await this.redis.eval(RELEASE,1,key,token);};}
}
