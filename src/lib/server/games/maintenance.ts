import { Storage } from '@google-cloud/storage';
import { getSupabase } from '$lib/server/db';
import { GCS_BUCKET_NAME } from '$lib/server/secrets';
import { checkResult,rpc } from './common';
const storage=new Storage();
/** Delete only fenced, unreferenced revisions after the seven-day quarantine. */
export async function collectAssets(){
	await rpc('wk_quarantine_assets',{});const db=await getSupabase();const revisions=checkResult(await db.from('kitchen_asset_revisions').select('id,metadata').lt('quarantined_at',new Date(Date.now()-7*86400000).toISOString()).limit(10))??[];
	for(const revision of revisions){if(!await rpc<boolean>('wk_claim_gc_asset',{p_id:revision.id}))continue;
		const variants=checkResult(await db.from('kitchen_asset_variants').select('object_path,generation').eq('revision_id',revision.id))??[];
		const files=[...variants,...(revision.metadata.masterPath?[{object_path:revision.metadata.masterPath,generation:revision.metadata.masterGeneration}]:[])];
		for(const file of files){if(file.object_path.startsWith('static/word-kitchen/'))continue;if(!file.object_path.startsWith('imagine-by-lai/word-kitchen/assets/')||!file.generation)throw new Error('INVALID_GC_OBJECT');await storage.bucket(GCS_BUCKET_NAME).file(file.object_path,{generation:file.generation}).delete({ignoreNotFound:true,ifGenerationMatch:file.generation});}
		await rpc('wk_finalize_gc_asset',{p_id:revision.id});
	}
}
