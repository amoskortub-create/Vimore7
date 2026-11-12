import { account, databases, DATABASE_ID, COL, Query } from '@/lib/appwrite';
import type { Models } from '@/lib/appwrite';

type LoginError = Error & {
  code?: number;
  type?: string;
  userMessage?: string;
};

function isPhoneNumber(identifier: string): boolean {
  return /^[+\d][\d\s\-().]{5,}$/.test(identifier);
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, '');
}

function toLoginError(error: unknown, stage: 'lookup' | 'login' | 'session' | 'profile'): LoginError {
  const appwriteError = error as {
    code?: number;
    type?: string;
    message?: string;
    name?: string;
    userMessage?: string;
  };
  const message = typeof appwriteError?.message === 'string' ? appwriteError.message : String(error);
  const code = typeof appwriteError?.code === 'number' ? appwriteError.code : undefined;
  const type = typeof appwriteError?.type === 'string' ? appwriteError.type : undefined;

  let userMessage = appwriteError?.userMessage || message;
  if (stage === 'lookup' && (code === 401 || code === 403)) {
    userMessage = 'Profile lookup blocked - set the users collection Read permission to Any';
  } else if (stage === 'login' && (type === 'user_invalid_credentials' || code === 401)) {
    userMessage = 'Wrong password';
  } else if (type === 'general_unauthorized_scope') {
    userMessage = 'Appwrite rejected this site - add its hostname as a Web platform';
  } else if (code === 403) {
    userMessage = 'Profile lookup blocked - set the users collection Read permission to Any';
  } else if (stage === 'session' && code === 401) {
    userMessage = 'Appwrite could not confirm the new session - check this hostname in Web platforms';
  } else if (
    appwriteError?.name === 'TypeError' ||
    /failed to fetch|network|load failed|timed out/i.test(message)
  ) {
    userMessage = 'Appwrite unreachable - check endpoint and Web platform CORS';
  }

  return Object.assign(new Error(message), { code, type, userMessage });
}

async function findProfile(
  identifier: string,
): Promise<{ document: Models.Document | null; matchedBy: 'username' | 'email' | 'phone' }> {
  const isPhone = isPhoneNumber(identifier);
  const normalizedIdentifier = identifier.toLowerCase();
  const matchedBy = isPhone ? 'phone' : identifier.includes('@') ? 'email' : 'username';
  const queries = isPhone
    ? [Query.equal('phone', normalizePhone(identifier))]
    : [
        Query.equal('username', normalizedIdentifier),
        Query.equal('email', identifier.includes('@') ? normalizedIdentifier : `${normalizedIdentifier}@vimore.cfd`),
      ];

  for (const query of queries) {
    const result = await databases.listDocuments(DATABASE_ID, COL.USERS, [
      query,
      Query.select(['email', 'username', 'phone']),
      Query.limit(1),
    ]);
    const document = result.documents[0];
    if (document) {
      return {
        document,
        matchedBy: isPhone ? 'phone' : document.username === normalizedIdentifier ? 'username' : 'email',
      };
    }
  }

  return { document: null, matchedBy };
}

export async function signInWithIdentifier(
  identifier: string,
  password: string,
): Promise<{ authUser: Models.User<Models.Preferences>; profileDoc: Models.Document }> {
  let stage: 'lookup' | 'login' | 'session' | 'profile' = 'lookup';
  try {
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier || !password) {
      throw Object.assign(new Error('Identifier and password are required'), {
        userMessage: 'Enter your ViMore ID or phone number and password.',
      });
    }

    let lookup: Awaited<ReturnType<typeof findProfile>>;
    try {
      lookup = await findProfile(trimmedIdentifier);
    } catch (error) {
      console.log('lookup result:', { found: false, lookupFailed: true });
      throw error;
    }
    const { document, matchedBy } = lookup;
    console.log('lookup result:', {
      found: Boolean(document),
      profileId: document?.$id ?? null,
      matchedBy,
      hasEmail: Boolean(document?.email),
    });

    if (!document) {
      throw Object.assign(new Error('No matching profile'), {
        userMessage: 'No account with that ViMore ID',
      });
    }
    if (typeof document.email !== 'string' || !document.email.includes('@')) {
      throw Object.assign(new Error('The profile does not contain a valid email address'), {
        userMessage: 'This profile has no sign-in email. Contact ViMore support.',
      });
    }

    stage = 'login';
    await account.createEmailPasswordSession(document.email, password);
    stage = 'session';
    const authUser = await account.get();
    if (authUser.$id !== document.$id) {
      throw Object.assign(new Error('The signed-in account does not match the looked-up profile'), {
        userMessage: 'The profile lookup did not match the signed-in account. Please try again.',
      });
    }

    stage = 'profile';
    const profileDoc = await databases.getDocument(DATABASE_ID, COL.USERS, authUser.$id);
    return { authUser, profileDoc };
  } catch (error) {
    const loginError = toLoginError(error, stage);
    console.error('login error code:', loginError.code ?? null);
    console.error('login error message:', loginError.message);
    throw loginError;
  }
}
