export const subjects = [
	{
		id: 'physics',
		label: 'Physics',
		color: '#71c9ff',
		symbol: '↗',
		description: 'Forces, light & sound',
		x: 24,
		y: 26
	},
	{
		id: 'chemistry',
		label: 'Chemistry',
		color: '#d2a0ff',
		symbol: '◈',
		description: 'Matter & mixtures',
		x: 51,
		y: 21
	},
	{
		id: 'biology',
		label: 'Biology',
		color: '#87dfab',
		symbol: '❋',
		description: 'Plants & living things',
		x: 77,
		y: 31
	},
	{
		id: 'earth',
		label: 'Earth & environment',
		color: '#f4c46e',
		symbol: '◎',
		description: 'Water, weather & our world',
		x: 76,
		y: 70
	},
	{
		id: 'space',
		label: 'Space',
		color: '#a9b3ff',
		symbol: '✦',
		description: 'Our place in the universe',
		x: 48,
		y: 77
	},
	{
		id: 'engineering',
		label: 'Engineering',
		color: '#ffab99',
		symbol: '⌁',
		description: 'Build, test & improve',
		x: 22,
		y: 66
	}
] as const;
export type SubjectId = (typeof subjects)[number]['id'];
export const concepts = [
	['forces', 'Forces & motion', 'physics'],
	['friction', 'Friction', 'physics'],
	['gravity', 'Gravity', 'physics'],
	['light', 'Light & shadows', 'physics'],
	['reflection', 'Reflection', 'physics'],
	['sound', 'Sound & vibration', 'physics'],
	['heat-transfer', 'Heat transfer', 'physics'],
	['buoyancy', 'Floating & sinking', 'physics'],
	['air', 'Air & air resistance', 'physics'],
	['balance', 'Balance', 'physics'],
	['states-of-matter', 'Changes of state', 'chemistry'],
	['dissolving', 'Dissolving', 'chemistry'],
	['mixtures', 'Mixtures & separation', 'chemistry'],
	['density', 'Density', 'chemistry'],
	['surface-tension', 'Surface tension', 'chemistry'],
	['capillary-action', 'Capillary action', 'chemistry'],
	['reaction', 'Chemical reactions', 'chemistry'],
	['evaporation', 'Evaporation', 'chemistry'],
	['plants', 'Plant growth', 'biology'],
	['habitats', 'Habitats', 'biology'],
	['adaptation', 'Structure & function', 'biology'],
	['biodiversity', 'Biodiversity', 'biology'],
	['senses', 'Senses & perception', 'biology'],
	['water-cycle', 'Water cycle', 'earth'],
	['weather', 'Weather', 'earth'],
	['soil', 'Soil & rocks', 'earth'],
	['erosion', 'Erosion', 'earth'],
	['sunlight', 'Sunlight & energy', 'earth'],
	['rotation', 'Earth’s rotation', 'space'],
	['moon', 'Moon phases', 'space'],
	['orbits', 'Orbits', 'space'],
	['scale', 'Models & scale', 'space'],
	['structures', 'Structures', 'engineering'],
	['materials', 'Material properties', 'engineering'],
	['design', 'Design & testing', 'engineering'],
	['measurement', 'Measuring & comparing', 'engineering']
].map(([id, label, subject]) => ({ id, label, subject: subject as SubjectId }));
export const conceptById = new Map(concepts.map((c) => [c.id, c]));
export const subjectById = new Map(subjects.map((s) => [s.id, s]));
