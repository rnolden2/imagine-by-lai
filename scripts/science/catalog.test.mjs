import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import { PGlite } from '@electric-sql/pglite';
import { starterCatalog } from '../../src/lib/science/starter.ts';
import { subjects } from '../../src/lib/science/taxonomy.ts';
import {
	activitySchema,
	validateCatalog,
	validateRecord
} from '../../src/lib/science/contracts.ts';
import { matches, emptyFilters, related, layout } from '../../src/lib/science/graph.ts';
import { contentHash, isPublishable } from '../../src/lib/server/science/integrity.ts';
import {
	duplicateReason,
	makeDraft,
	approveRecord,
	expandCatalog,
	importCatalog,
	main
} from './catalog.mjs';

function freshActivity(id = 'new-paper-test') {
	return {
		...structuredClone(starterCatalog[0].activity),
		id,
		title: `Testing ${id}`,
		question: `What distinct result can we record for ${id}?`
	};
}
const provenance = { model: 'fixture-model', responseId: 'fixture-response' };

test('148 complete starter activities cover all six subjects and have meaningful neighbors', () => {
	const records = validateCatalog(starterCatalog);
	assert.equal(records.length, 148);
	const expectedCounts = {
		physics: 26,
		chemistry: 26,
		biology: 24,
		earth: 24,
		space: 24,
		engineering: 24
	};
	for (const subject of subjects)
		assert.equal(
			records.filter((r) => r.activity.subject === subject.id).length,
			expectedCounts[subject.id]
		);
	for (let index = 0; index < records.length; index++)
		assert.equal(
			duplicateReason(records[index].activity, records.slice(0, index)),
			null,
			records[index].activity.id
		);
	for (const record of records) {
		assert.ok(isPublishable(record));
		assert.ok(
			related(
				record.activity,
				records.map((r) => r.activity)
			).length > 0,
			record.activity.id
		);
	}
});

test('cross-subject science connections are explained; broad skills alone do not connect', () => {
	const all = starterCatalog.map((r) => r.activity);
	const insulation = all.find((a) => a.id === 'ice-insulation');
	assert.ok(
		related(insulation, all).some(
			(r) => r.activity.subject !== insulation.subject && r.reason.includes('heat transfer')
		)
	);
	const measurementOnly = { ...freshActivity(), concepts: ['measurement', 'orbits'] };
	assert.equal(
		related({ ...insulation, concepts: ['measurement', 'heat-transfer'] }, [measurementOnly])
			.length,
		0
	);
	assert.ok(related(insulation, all, 'materials').every((r) => r.reason.startsWith('Both use ')));
});

test('practical filters combine AND terms and handle either location and age bounds', () => {
	const activity = {
		...freshActivity(),
		ageMin: 7,
		ageMax: 9,
		setting: 'either',
		activeMinutes: 20,
		materials: [
			{ name: 'paper', quantity: '1' },
			{ name: 'water', quantity: '1 cup' }
		]
	};
	assert.equal(
		matches(activity, {
			...emptyFilters,
			age: '8',
			setting: 'outdoor',
			minutes: '30',
			materials: 'paper, water'
		}),
		true
	);
	for (const filter of [
		{ age: '5' },
		{ minutes: '15' },
		{ subject: 'biology' },
		{ materials: 'paper, vinegar' },
		{ query: 'impossible query' },
		{ adult: 'demonstration' }
	])
		assert.equal(matches(activity, { ...emptyFilters, ...filter }), false);
});

test('layout is deterministic and keeps stars within the map at 1000 nodes', () => {
	const thousand = Array.from({ length: 1000 }, (_, i) => ({
		...starterCatalog[i % starterCatalog.length].activity,
		id: `fixture-${i}`
	}));
	const first = layout(thousand);
	assert.equal(first.length, 1000);
	assert.deepEqual(first, layout([...thousand].reverse()));
	assert.ok(first.every((star) => star.x > 0 && star.x < 100 && star.y > 0 && star.y < 100));
});

test('validation rejects unknown concepts, inverted ages, extra fields and duplicate IDs', () => {
	const record = structuredClone(starterCatalog[0]);
	assert.throws(() =>
		validateRecord({
			...record,
			activity: { ...record.activity, concepts: ['made-up', 'heat-transfer'] }
		})
	);
	assert.throws(() =>
		validateRecord({ ...record, activity: { ...record.activity, ageMin: 10, ageMax: 5 } })
	);
	assert.throws(() =>
		validateRecord({ ...record, activity: { ...record.activity, secret: 'not allowed' } })
	);
	assert.throws(() => validateCatalog([record, record]), /Duplicate/);
	assert.throws(
		() => validateRecord({ ...record, provenance: { ...record.provenance, origin: 'ai' } }),
		/cannot become starter/
	);
});

test('API schema is strict and excludes status/review fields', () => {
	const format = zodTextFormat(
		z.object({ activities: z.array(activitySchema) }).strict(),
		'science_activities'
	);
	assert.equal(format.type, 'json_schema');
	assert.equal(format.strict, true);
	assert.equal(format.schema.properties.activities.items.additionalProperties, false);
	assert.equal(format.schema.properties.activities.items.properties.status, undefined);
	const sourceUrl =
		format.schema.properties.activities.items.properties.sources.items.properties.url;
	assert.equal(sourceUrl.format, undefined);
	assert.ok(sourceUrl.pattern.startsWith('^https:'));
});

test('renamed identical scientific questions are rejected as duplicates', () => {
	const candidate = {
		...starterCatalog[0].activity,
		id: 'renamed',
		title: 'A completely different title'
	};
	assert.match(duplicateReason(candidate, starterCatalog), /Same scientific question/);
	assert.equal(duplicateReason(freshActivity('investigate-new'), starterCatalog), null);
});

test('review requires sources and locks approval to exact activity content independent of key order', () => {
	const draft = makeDraft(freshActivity(), provenance);
	assert.equal(isPublishable(draft), false);
	assert.throws(
		() => approveRecord(draft, 'Test reviewer', 'Reviewed fixture for testing.'),
		/reference/
	);
	draft.activity.sources = [{ title: 'Fixture source', url: 'https://example.org/science' }];
	const approved = approveRecord(draft, 'Test reviewer', 'Reviewed fixture for testing.');
	assert.ok(isPublishable(approved));
	assert.equal(
		contentHash(approved.activity),
		contentHash(Object.fromEntries(Object.entries(approved.activity).reverse()))
	);
	approved.activity.steps[0] = 'Changed content invalidates this review.';
	assert.equal(isPublishable(approved), false);
});

test('expansion checkpoints drafts, resumes to target, and never auto-reviews', async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'science-expansion-'));
	const filename = path.join(directory, 'catalog.json');
	try {
		let calls = 0;
		const questions = [
			'Which fabric blocks a flashlight beam most effectively?',
			'Can a folded disk roll steadily across a wooden floor?',
			'Where do tiny bubbles collect inside a clear drinking glass?',
			'Why does a thick sponge retain puddles after gentle squeezing?'
		];
		const generate = async (_prompt, count) => {
			calls++;
			return {
				id: `r${calls}`,
				model: 'fixture',
				usage: { total_tokens: 10 },
				activities: Array.from({ length: count }, (_, i) => ({
					...freshActivity(`distinct-${calls}-${i}`),
					title: questions[(calls - 1) * 2 + i],
					question: questions[(calls - 1) * 2 + i]
				}))
			};
		};
		const first = await expandCatalog({
			filename,
			target: starterCatalog.length + 4,
			batchSize: 2,
			maxBatches: 1,
			generate,
			log: () => {}
		});
		assert.equal(first.total, starterCatalog.length + 2);
		assert.equal(first.reachedTarget, false);
		const second = await expandCatalog({
			filename,
			target: starterCatalog.length + 4,
			batchSize: 2,
			maxBatches: 2,
			generate,
			log: () => {}
		});
		assert.equal(second.total, starterCatalog.length + 4);
		assert.equal(calls, 2);
		const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
		assert.ok(
			saved.every((r) => r.status === 'draft' && r.review === null && r.provenance.responseId)
		);
		await expandCatalog({
			filename,
			target: starterCatalog.length + 4,
			batchSize: 2,
			maxBatches: 2,
			generate,
			log: () => {}
		});
		assert.equal(calls, 2);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test('invalid/duplicate batch stops, logs rejection, and preserves earlier records', async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'science-rejection-'));
	const filename = path.join(directory, 'catalog.json');
	try {
		await assert.rejects(
			() =>
				expandCatalog({
					filename,
					target: starterCatalog.length + 1,
					batchSize: 1,
					maxBatches: 4,
					log: () => {},
					generate: async () => ({
						id: 'duplicate',
						model: 'fixture',
						activities: [starterCatalog[0].activity]
					})
				}),
			/No distinct valid/
		);
		assert.deepEqual(JSON.parse(await fs.readFile(filename, 'utf8')), []);
		assert.match(await fs.readFile(`${filename}.rejections.jsonl`, 'utf8'), /Duplicate/);
		await assert.rejects(fs.stat(`${filename}.lock`), { code: 'ENOENT' });
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test('preview makes no network calls and invalid CLI limits fail before generation', async () => {
	const oldFetch = globalThis.fetch;
	globalThis.fetch = () => {
		throw new Error('Unexpected network');
	};
	try {
		await main(['expand', '--target', '1000']);
		await assert.rejects(main(['expand', '--batch-size', '0']), /batch-size/);
		await assert.rejects(main(['expand', '--max-batches', 'NaN']), /max-batches/);
	} finally {
		globalThis.fetch = oldFetch;
	}
});

test('Postgres migration, importer transaction, relationships and client access rules', async () => {
	const db = new PGlite();
	try {
		await db.exec(
			'create role anon; create role authenticated; create role service_role bypassrls;'
		);
		await db.exec(
			await fs.readFile(
				new URL('../../supabase/migrations/20261018224806_science_catalog.sql', import.meta.url),
				'utf8'
			)
		);
		const tag = (strings, ...values) =>
			db
				.query(strings.map((s, i) => s + (i < values.length ? `$${i + 1}` : '')).join(''), values)
				.then((r) => r.rows);
		tag.json = (record) => JSON.stringify(record);
		tag.begin = async (callback) => {
			await db.exec('begin');
			try {
				await callback(tag);
				await db.exec('commit');
			} catch (e) {
				await db.exec('rollback');
				throw e;
			}
		};
		await importCatalog(tag, starterCatalog);
		await importCatalog(tag, starterCatalog); // Repeat imports are idempotent.
		assert.equal(
			(await db.query('select count(*)::int n from science_experiments')).rows[0].n,
			starterCatalog.length
		);
		assert.equal(
			(await db.query('select count(*)::int n from science_experiment_concepts')).rows[0].n,
			starterCatalog.reduce((n, r) => n + r.activity.concepts.length, 0)
		);
		const rls = await db.query(
			"select rowsecurity from pg_tables where schemaname='public' and tablename like 'science_%'"
		);
		assert.equal(rls.rows.length, 4);
		assert.ok(rls.rows.every((r) => r.rowsecurity));
		for (const role of ['anon', 'authenticated']) {
			for (const table of [
				'science_experiments',
				'science_concepts',
				'science_subjects',
				'science_experiment_concepts'
			]) {
				assert.equal(
					(await db.query("select has_table_privilege($1,$2,'select') allowed", [role, table]))
						.rows[0].allowed,
					false
				);
			}
		}
		await assert.rejects(
			importCatalog(tag, [makeDraft(freshActivity(), provenance)]),
			/only starters and reviewed/
		);
		const draft = makeDraft(freshActivity(), provenance);
		draft.activity.sources = [{ title: 'Fixture source', url: 'https://example.org/science' }];
		const reviewed = approveRecord(draft, 'Reviewer', 'Fixture scientific and source review.');
		await importCatalog(tag, [reviewed]);
		const changed = structuredClone(reviewed);
		changed.activity.title = 'Changed reviewed activity';
		changed.review.contentHash = contentHash(changed.activity);
		await assert.rejects(importCatalog(tag, [changed]), /Refusing to overwrite/);
		assert.equal(
			(
				await db.query('select definition from science_experiments where id=$1', [
					reviewed.activity.id
				])
			).rows[0].definition.activity.title,
			reviewed.activity.title
		);
		await assert.rejects(
			db.query(
				"insert into science_experiments(id,subject_id,status,definition) values ('invalid','physics','reviewed',$1)",
				[JSON.stringify({ activity: { id: 'invalid', subject: 'physics' }, status: 'reviewed' })]
			),
			/science_review_required/
		);
	} finally {
		await db.close();
	}
});
