import { loadScienceCatalog } from '#lib/server/science/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ catalog: await loadScienceCatalog() });
