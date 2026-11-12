import 'server-only';
import { Client, Databases, Storage, Users } from 'node-appwrite';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.mediatechliberia.online/v1';
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'vimore123';

export const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'vimoreprod';

function createAdminClient(): Client {
  const apiKey = process.env.APPWRITE_API_KEY;
  if (!apiKey) {
    throw new Error('APPWRITE_API_KEY is not configured for server-side Appwrite operations.');
  }

  return new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(apiKey);
}

export function getAdminDatabases(): Databases {
  return new Databases(createAdminClient());
}

export function getAdminUsers(): Users {
  return new Users(createAdminClient());
}

export function getAdminStorage(): Storage {
  return new Storage(createAdminClient());
}
