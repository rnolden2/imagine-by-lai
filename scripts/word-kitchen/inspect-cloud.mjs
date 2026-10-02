import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleAuth } from 'google-auth-library';
import fs from 'node:fs/promises';

const project = process.env.GCS_PROJECT_ID || 'api-project-371618';
const secrets = new SecretManagerServiceClient();
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
try {
	const [items] = await secrets.listSecrets({ parent: `projects/${project}` });
	console.log(
		'Secret names:',
		items.map((x) => x.name.split('/').at(-1))
	);
} catch (error) {
	console.log('Secret inventory:', error.code);
}
const read = async (name) => {
	const [result] = await secrets.accessSecretVersion({
		name: `projects/${project}/secrets/${name}/versions/latest`
	});
	return result.payload.data.toString().trim();
};
const url = await read('supabase_url');
let key;
for (const name of ['supabase_service_role_key', 'supabase_publishable_key']) {
	try {
		const value = await read(name);
		const role = value.startsWith('eyJ')
			? JSON.parse(Buffer.from(value.split('.')[1], 'base64url')).role
			: value.startsWith('sb_secret_')
				? 'secret'
				: 'publishable';
		console.log('Credential role:', name, role);
		if (role === 'service_role' || role === 'secret') key = value;
	} catch (error) {
		console.log('Credential unavailable:', name, error.code);
	}
}
if (key) {
	const response = await fetch(`${url}/rest/v1/`, {
		headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' }
	});
	if (response.ok) {
		const schema = await response.json();
		await fs.writeFile('/private/tmp/imagine-live-schema.json', JSON.stringify(schema));
		console.log('Live table definitions:', Object.keys(schema.definitions || {}));
	} else console.log('Schema HTTP status:', response.status);
}
try {
	const client = await auth.getClient();
	const result = await client.request({
		url: `https://run.googleapis.com/v2/projects/${project}/locations/us-central1/services/imagine-by-lai`
	});
	const service = result.data;
	console.log('Cloud Run:', { uri: service.uri, serviceAccount: service.template?.serviceAccount });
	await fs.writeFile('/private/tmp/imagine-live-run.json', JSON.stringify(service));
} catch (error) {
	console.log('Cloud Run metadata:', error.code);
}
