import { beforeAll,afterAll,it,expect,vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { curatedInputs } from './curated';
const mocks=vi.hoisted(()=>({plan:vi.fn(),image:vi.fn(),publish:vi.fn(),db:null as SupabaseClient|null}));
vi.mock('$env/dynamic/private',()=>({env:{WORD_KITCHEN_TASK_QUEUE:'projects/test/locations/test/queues/test',WORD_KITCHEN_WORKER_URL:'https://worker.test',WORD_KITCHEN_WORKER_SERVICE_ACCOUNT:'test@example.iam.gserviceaccount.com'}}));
vi.mock('$lib/server/db',()=>({getSupabase:async()=>mocks.db}));
vi.mock('$lib/server/ai',()=>({generateGamePlan:mocks.plan,generateGameImage:mocks.image}));
vi.mock('./assets',()=>({publishGeneratedAsset:mocks.publish,deliveryManifest:vi.fn()}));
import { enqueueGeneration,runGeneration } from './generation';
const originalFetch=globalThis.fetch;let database:PGlite;
beforeAll(async()=>{
	process.env.WORD_KITCHEN_BROWSER_TEST='1';
	const fixture=await import('../../../../e2e/fixtures/word-kitchen-backend.mjs');database=fixture.db;
	mocks.db=createClient('https://kitchen-tests.supabase.co','fixture-only-server-key',{auth:{persistSession:false}});
	const input=curatedInputs[1];mocks.plan.mockResolvedValue({supported:true,reason:'',title:'My Pancakes',description:'Make a pretend stack and practice your words.',ingredients:[{label:'flour',canonicalId:'ingredient:flour',tags:['wheat']},{label:'milk',canonicalId:'ingredient:milk',tags:['dairy']},{label:'egg',canonicalId:'ingredient:egg',tags:['egg']}],vocabulary:input.vocabulary,actions:input.actions});
	mocks.image.mockResolvedValue(Buffer.from('test-image'));
	mocks.publish.mockImplementation(async(identity:string,token:number)=>{const id=randomUUID();const result=await mocks.db!.rpc('wk_publish_asset',{p_identity:identity,p_token:token,p_revision:id,p_metadata:{fixture:true},p_report:{valid:true},p_variants:[]});if(result.error)throw new Error(result.error.message);return id;});
},30000);
afterAll(async()=>{globalThis.fetch=originalFetch;delete process.env.WORD_KITCHEN_BROWSER_TEST;await database?.close();});
it('runs persisted stages, reuses shared assets, fences duplicate workers, and approves an exact revision',async()=>{
	const favorite=randomUUID();await mocks.db!.from('game_favorite_foods').insert({id:favorite,child_id:1,display_name:'Pancakes',normalized_name:'pancakes'});
	const key=randomUUID();const job=await enqueueGeneration(1,favorite,key);expect((await enqueueGeneration(1,favorite,key)).id).toBe(job.id);
	let status='queued';for(let i=0;i<40&&!['failed','needs_parent_input','ready_for_preview'].includes(status);i++){
		await Promise.all([runGeneration(job.id),runGeneration(job.id)]);
		const result=await mocks.db!.from('game_generation_jobs').select('*').eq('id',job.id).single();expect(result.error).toBeNull();status=result.data!.status;
	}
	expect(status).toBe('ready_for_preview');expect(mocks.plan).toHaveBeenCalledTimes(1);expect(mocks.image).toHaveBeenCalledTimes(1);expect(mocks.publish).toHaveBeenCalledTimes(1);
	const draft=(await mocks.db!.from('game_recipe_revisions').select('*').eq('status','ready_for_preview').single()).data!;
	const bad=await mocks.db!.rpc('wk_approve_recipe',{p_revision:draft.id,p_checksum:'changed',p_child:1,p_preferences:0});expect(bad.error?.message).toContain('REVISION_CHANGED');
	const approved=await mocks.db!.rpc('wk_approve_recipe',{p_revision:draft.id,p_checksum:draft.checksum,p_child:1,p_preferences:0});expect(approved.error).toBeNull();expect((await mocks.db!.from('game_recipe_assignments').select('*').eq('child_id',1)).data).toHaveLength(1);
});
it('cancelling before dispatch performs no provider calls',async()=>{const favorite=(await mocks.db!.from('game_favorite_foods').select('id').single()).data!;const job=await enqueueGeneration(1,favorite.id,randomUUID());await mocks.db!.rpc('wk_cancel_job',{p_id:job.id});await runGeneration(job.id);expect(mocks.plan).toHaveBeenCalledTimes(1);expect((await mocks.db!.from('game_generation_jobs').select('status').eq('id',job.id).single()).data?.status).toBe('cancelled');});

it('reserves fallback spending and records Gemini asset provenance', async () => {
 const plan = await mocks.plan.mock.results[0].value;
 mocks.plan.mockImplementation(async (_prompt, _schema, options) => { await options.beforeFallback(); return plan; });
 mocks.image.mockImplementation(async (_prompt, _transparent, options) => { await options.beforeFallback(); options.onProvider('gemini'); return Buffer.from('test-image'); });
 const favorite = (await mocks.db!.from('game_favorite_foods').select('id').single()).data!;
 const job = await enqueueGeneration(1, favorite.id, randomUUID());
 let status = 'queued';
 for (let i=0;i<40 && !['failed','needs_parent_input','ready_for_preview'].includes(status);i++) {
  await runGeneration(job.id);
  const result=await mocks.db!.from('game_generation_jobs').select('*').eq('id',job.id).single();
  status=result.data!.status;
 }
 expect(status).toBe('ready_for_preview');
 const costs = await database.query<{ logical_key: string }>('select logical_key from game_cost_reservations where job_id=$1', [job.id]);
 expect(costs.rows.filter(row => row.logical_key.endsWith(':gemini'))).toHaveLength(2);
 expect(mocks.publish).toHaveBeenLastCalledWith(expect.any(String), expect.any(Number), expect.any(Buffer), { jobId: job.id, provider: 'gemini' }, false);
});
