/** Provider registry adapted from OpenCodex's provider/configuration architecture. */
export interface ModelDescriptor{id:string;backend:string;aliases?:string[];contextWindow?:number;capabilities:string[];inputCostMicros?:number;outputCostMicros?:number}
export interface ProviderAdapter{readonly id:string;discoverModels(signal?:AbortSignal):Promise<ModelDescriptor[]>;available():Promise<boolean>}
export interface RoutingContext{requestedModel:string;allowedBackends?:string[];blockedModels?:string[];preferredBackend?:string}
export class ProviderRegistry{
 private readonly providers=new Map<string,ProviderAdapter>();private readonly aliases=new Map<string,string>();
 register(provider:ProviderAdapter):void{if(this.providers.has(provider.id))throw new Error(`Duplicate provider ${provider.id}`);this.providers.set(provider.id,provider)}
 alias(alias:string,model:string):void{this.aliases.set(alias,model)}
 async models(signal?:AbortSignal):Promise<ModelDescriptor[]>{const settled=await Promise.allSettled([...this.providers.values()].map(async p=>await p.available()?p.discoverModels(signal):[]));return settled.flatMap(r=>r.status==="fulfilled"?r.value:[])}
 async route(context:RoutingContext):Promise<{provider:ProviderAdapter;model:ModelDescriptor}>{const requested=this.aliases.get(context.requestedModel)??context.requestedModel;if(context.blockedModels?.includes(requested))throw new Error(`Model ${requested} is blocked`);const candidates=(await this.models()).filter(m=>(m.id===requested||m.aliases?.includes(requested))&&(!context.allowedBackends||context.allowedBackends.includes(m.backend)));const selected=candidates.find(m=>m.backend===context.preferredBackend)??candidates.sort((a,b)=>(a.inputCostMicros??Infinity)-(b.inputCostMicros??Infinity))[0];const provider=selected&&this.providers.get(selected.backend);if(!selected||!provider)throw new Error(`No available route for ${requested}`);return{provider,model:selected}}
}
