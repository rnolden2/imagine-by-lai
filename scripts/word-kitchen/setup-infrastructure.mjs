// Idempotent infrastructure bootstrap. Defaults to a read-only plan.
import { GoogleAuth } from 'google-auth-library';
const project=process.env.GCS_PROJECT_ID??'api-project-371618';
const region=process.env.WORD_KITCHEN_REGION??'us-central1';
const workerUrl=process.env.WORD_KITCHEN_WORKER_URL;
const workerEmail=`word-kitchen-worker@${project}.iam.gserviceaccount.com`;
const runtimeEmail=process.env.WORD_KITCHEN_RUNTIME_SERVICE_ACCOUNT;
const apply=process.argv.includes('--apply');
const schedule='every 5 hours';
const queue=`projects/${project}/locations/${region}/queues/word-kitchen`;
if(!workerUrl||!runtimeEmail)throw new Error('Set WORD_KITCHEN_WORKER_URL and WORD_KITCHEN_RUNTIME_SERVICE_ACCOUNT.');
if(new URL(workerUrl).protocol!=='https:')throw new Error('Worker URL must use HTTPS.');
console.log(JSON.stringify({project,region,workerUrl,workerEmail,runtimeEmail,queue,schedule,apply},null,2));
if(!apply){console.log('Plan only. Add --apply after deploying and validating the database.');process.exit(0);}
const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});const client=await auth.getClient();
async function request(url,method='GET',data){return(await client.request({url,method,data})).data;}
async function optional(url){try{return await request(url);}catch(e){if(e.response?.status===404)return null;throw e;}}
const accountUrl=`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${workerEmail}`;
if(!await optional(accountUrl))await request(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`,'POST',{accountId:'word-kitchen-worker',serviceAccount:{displayName:'Word Kitchen authenticated task delivery'}});
// Merge grants using etags; preserve unrelated project and service-account permissions.
async function grant(url,role,member){const policy=await request(`${url}:getIamPolicy`,'POST',{});policy.bindings??=[];let binding=policy.bindings.find(b=>b.role===role&&!b.condition);if(!binding){binding={role,members:[]};policy.bindings.push(binding);}if(!binding.members.includes(member)){binding.members.push(member);await request(`${url}:setIamPolicy`,'POST',{policy});}}
await grant(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`,'roles/cloudtasks.enqueuer',`serviceAccount:${runtimeEmail}`);
await grant(accountUrl,'roles/iam.serviceAccountUser',`serviceAccount:${runtimeEmail}`);
const queueUrl=`https://cloudtasks.googleapis.com/v2/${queue}`;
const config={name:queue,rateLimits:{maxDispatchesPerSecond:3,maxConcurrentDispatches:3},retryConfig:{maxAttempts:5,minBackoff:'10s',maxBackoff:'120s',maxRetryDuration:'1800s'}};
if(await optional(queueUrl))await request(`${queueUrl}?updateMask=rateLimits,retryConfig`,'PATCH',config);
else await request(`https://cloudtasks.googleapis.com/v2/projects/${project}/locations/${region}/queues`,'POST',config);
const schedulerName=`projects/${project}/locations/${region}/jobs/word-kitchen-reconcile`;
const schedulerUrl=`https://cloudscheduler.googleapis.com/v1/${schedulerName}`;
const scheduler={name:schedulerName,schedule,timeZone:'Etc/UTC',attemptDeadline:'180s',httpTarget:{uri:`${workerUrl}/api/internal/word-kitchen/reconcile`,httpMethod:'POST',headers:{'Content-Type':'application/json'},body:Buffer.from('{}').toString('base64'),oidcToken:{serviceAccountEmail:workerEmail,audience:workerUrl}}};
if(await optional(schedulerUrl))await request(`${schedulerUrl}?updateMask=schedule,timeZone,httpTarget,attemptDeadline`,'PATCH',scheduler);
else await request(`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${region}/jobs`,'POST',scheduler);
console.log('Queue and authenticated five-hour recovery reconciler configured. Confirm task delivery and IAM before enabling generation.');
