import { fail, type Action } from '@sveltejs/kit';
import { getSupabase, throwSupabaseError } from '$lib/server/db';
import { isOperation, NUMBER_RANGES, MINUTE_STEPS } from '$lib/math';

export const saveMathSettings: Action = async ({ request, locals }) => {
	if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });
	const data = await request.formData();
	const childId = Number(data.get('childId') ?? data.get('userId'));
	const maxNumber = Number(data.get('maxNumber'));
	const minuteStep = Number(data.get('minuteStep') ?? 15);
	const raw = data.getAll('operations');
	const result = { mathChildId: childId, mathAction: true };
	if (!Number.isSafeInteger(childId) || childId <= 0 || !raw.length || !raw.every(isOperation)) {
		return fail(400, {
			...result,
			message: 'Choose a child and at least one valid math operation.'
		});
	}
	if (!NUMBER_RANGES.includes(maxNumber as 10) || !MINUTE_STEPS.includes(minuteStep as 5)) {
		return fail(400, { ...result, message: 'Choose a supported number range and clock interval.' });
	}
	try {
		const supabase = await getSupabase();
		const child = await supabase
			.from('child_profiles')
			.select('id')
			.eq('id', childId)
			.maybeSingle();
		if (child.error) throwSupabaseError('checking child profile', child.error);
		if (!child.data)
			return fail(404, { ...result, message: 'This child profile no longer exists.' });
		const { error } = await supabase.from('math_settings').upsert(
			{
				child_id: childId,
				operations: [...new Set(raw)],
				config: {
					maxNumber,
					fractions: { denominators: [2, 3, 4, 6, 8] },
					time: { minuteStep },
					recognition: { maxNumber: Math.min(maxNumber, 20) }
				},
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'child_id' }
		);
		if (error) throwSupabaseError('saving math settings', error);
		return {
			...result,
			success: true,
			message: 'Math settings saved. Open practice pages update automatically.'
		};
	} catch (error) {
		console.error('Failed to save math settings:', error);
		return fail(503, { ...result, message: 'Math settings could not be saved. Please try again.' });
	}
};

export const clearMathStats: Action = async ({ request, locals }) => {
	if (!locals.user?.isAdmin) return fail(403, { message: 'Admin access required.' });
	const data = await request.formData();
	const childId = Number(data.get('childId') ?? data.get('userId'));
	const result = { mathChildId: childId, mathAction: true };
	if (!Number.isSafeInteger(childId) || childId <= 0)
		return fail(400, { ...result, message: 'Choose a child whose history should be cleared.' });
	try {
		const supabase = await getSupabase();
		const { error } = await supabase.from('math_attempts').delete().eq('child_id', childId);
		if (error) throwSupabaseError('clearing math history', error);
		return { ...result, success: true, message: 'Math history cleared for this child.' };
	} catch (error) {
		console.error('Failed to clear math history:', error);
		return fail(503, {
			...result,
			message: 'Math history could not be cleared. Please try again.'
		});
	}
};
