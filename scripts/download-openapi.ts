#!/usr/bin/env bun

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OPENAPI_URL = 'https://dac-static.atlassian.com/cloud/confluence/openapi-v2.v3.json';
const OUTPUT_PATH = resolve(process.cwd(), 'src/openapi/confluence-openapi.json');

async function downloadOpenAPISpec() {
  console.log('Downloading Confluence OpenAPI specification...');
  
  try {
    const response = await fetch(OPENAPI_URL);
    
    if (!response.ok) {
      throw new Error(`Failed to download OpenAPI spec: ${response.status} ${response.statusText}`);
    }
    
    const spec = await response.json();
    
    // Write the spec to file with pretty formatting
    writeFileSync(OUTPUT_PATH, JSON.stringify(spec, null, 2));
    
    console.log(`✅ OpenAPI spec downloaded successfully to ${OUTPUT_PATH}`);
    console.log(`   Version: ${spec.info?.version || 'unknown'}`);
    console.log(`   Title: ${spec.info?.title || 'unknown'}`);
    
  } catch (error) {
    console.error('❌ Error downloading OpenAPI spec:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  await downloadOpenAPISpec();
}