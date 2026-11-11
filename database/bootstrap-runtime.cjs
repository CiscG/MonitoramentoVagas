#!/usr/bin/env node
'use strict';
/* One-time initialization from the existing public JSON. Never overwrites state. */
const fs=require('node:fs');
const path=require('node:path');
const { Client }=require('pg');
const { normalizeLegacyJob }=require('./import-jobs.cjs');
const root=path.resolve(__dirname,'..');
const jobsPath=path.join(root,'data','vagas.json');
const reportsPath=path.join(root,'data','relatorios-semanais.json');

async function main(){
 const data=JSON.parse(fs.readFileSync(jobsPath,'utf8'));
 const reports=JSON.parse(fs.readFileSync(reportsPath,'utf8'));
 if(!Array.isArray(data.vagas)||!Array.isArray(data.historicoVagas)||
    !Array.isArray(reports.reports))throw new Error('JSON inicial inválido. Não iniciar migração.');
 const jobs=[...data.historicoVagas,...data.vagas].map(normalizeLegacyJob);
 const summary={jobs:jobs.length,existingReports:reports.reports.length};
 if(process.argv.includes('--dry-run')){console.log(JSON.stringify({...summary,dryRun:true}));return;}
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL deve existir no ambiente.');
 const client=new Client({connectionString:process.env.DATABASE_URL});
 await client.connect();
 try{
  await client.query('BEGIN');
  const existing=await client.query('SELECT revision FROM tecops_pipeline_state WHERE singleton=TRUE FOR UPDATE');
  if(existing.rowCount)throw new Error('Estado já inicializado. Bootstrapping recusado para não substituir o histórico.');
  for(const job of jobs)await client.query('SELECT * FROM tecops_upsert_job($1::jsonb)',[JSON.stringify(job)]);
  await client.query('INSERT INTO tecops_pipeline_state(singleton,payload,report_archive,revision) VALUES(TRUE,$1::jsonb,$2::jsonb,0)',
    [JSON.stringify({...data,eventosHistorico:Array.isArray(data.eventosHistorico)?data.eventosHistorico:[]}),JSON.stringify(reports)]);
  await client.query('COMMIT');console.log(JSON.stringify({...summary,initialized:true}));
 }catch(error){await client.query('ROLLBACK');throw error;}
 finally{await client.end();}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
