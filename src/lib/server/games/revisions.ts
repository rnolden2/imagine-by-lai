import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/db';
import { validateRecipe } from '$lib/games/word-kitchen/contracts';
import { checkResult,hash,rpc } from './common';
import { learningContext } from './learning-context';
export async function reviseRecipe(id:string,checksum:string,title:string,description:string,definitions:Array<{id:string;definition:string}>){
	const db=await getSupabase();const source=checkResult(await db.from('game_recipe_revisions').select('*').eq('id',id).maybeSingle());if(!source||source.checksum!==checksum)error(409,'The recipe changed. Reload before editing.');
	const owner=checkResult(await db.from('game_recipes').select('child_id,origin,archived_at').eq('id',source.recipe_id).single());if(!owner||owner.origin!=='generated'||owner.archived_at)error(409,'This recipe cannot be edited.');
	const recipe=validateRecipe(structuredClone(source.definition));recipe.revisionId=randomUUID();recipe.title=title;recipe.description=description;
	for(const item of definitions){const word=recipe.vocabulary.find(v=>v.id===item.id);if(!word)error(400,'Unknown vocabulary item.');word.definition=item.definition;for(const step of recipe.steps){if(step.mechanic==='definition_match'&&step.wordBinding?.source==='cooking'&&step.wordBinding.vocabularyId===item.id){const config=step.config;const answer=config.choices.find(c=>c.id===config.answer);if(answer)answer.label=item.definition;}}}
	validateRecipe(recipe);const context=await learningContext(Number(owner.child_id));await rpc('wk_revise_recipe',{p_source:id,p_checksum:checksum,p_recipe:recipe,p_new_checksum:hash(recipe),p_preferences:context.settings.revision});return{id:recipe.revisionId};
}
