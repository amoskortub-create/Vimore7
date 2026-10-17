/**
 * Clear legacy security-question recovery data from user profiles.
 *
 * Dry run: node scripts/clear-legacy-security-answers.mjs
 * Apply:   node scripts/clear-legacy-security-answers.mjs --apply
 */
import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1';
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';
const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'vimoreprod';
const API_KEY = process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error('APPWRITE_API_KEY is not set.');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);
const apply = process.argv.includes('--apply');
let cursor;
let affected = 0;

do {
  const queries = [Query.limit(100)];
  if (cursor) queries.push(Query.cursorAfter(cursor));
  const page = await databases.listDocuments(DATABASE_ID, 'users', queries);

  for (const user of page.documents) {
    const legacyFields = {};
    if (typeof user.security_answer === 'string' && user.security_answer) {
      legacyFields.security_answer = '';
    }
    if (typeof user.security_question === 'string' && user.security_question) {
      legacyFields.security_question = '';
    }
    if (Object.keys(legacyFields).length === 0) continue;

    affected++;
    if (apply) {
      await databases.updateDocument(DATABASE_ID, 'users', user.$id, legacyFields);
    }
  }

  cursor = page.documents.at(-1)?.$id;
} while (cursor);

console.log(
  apply
    ? `Cleared legacy recovery fields from ${affected} user profile(s).`
    : `Found ${affected} user profile(s) with legacy recovery fields. No data was changed. Run with --apply to clear them.`,
);
