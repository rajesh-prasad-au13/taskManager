const ACCOUNT_STORAGE_KEY = 'workloadflow_local_account_v1';
const SESSION_STORAGE_KEY = 'workloadflow_local_session_v1';
const PBKDF2_ITERATIONS = 310_000;

interface LocalAccount {
  username: string;
  salt: string;
  passwordHash: string;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function hashPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function getLocalAccount(): LocalAccount | null {
  const serialized = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
  if (!serialized) return null;

  const account: unknown = JSON.parse(serialized);
  if (
    typeof account !== 'object' ||
    account === null ||
    !('username' in account) ||
    typeof account.username !== 'string' ||
    !('salt' in account) ||
    typeof account.salt !== 'string' ||
    !('passwordHash' in account) ||
    typeof account.passwordHash !== 'string'
  ) {
    throw new Error('Saved local account data is invalid. Clear this site’s data to set up a new account.');
  }
  return account as LocalAccount;
}

export function getLocalAuthStatus(): 'setup' | 'login' | 'authenticated' {
  const account = getLocalAccount();
  if (!account) return 'setup';
  return window.sessionStorage.getItem(SESSION_STORAGE_KEY) === 'active'
    ? 'authenticated'
    : 'login';
}

export async function createLocalAccount(
  username: string,
  password: string,
): Promise<void> {
  if (getLocalAccount()) {
    throw new Error('A local account already exists in this browser.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await hashPassword(password, salt);
  const account: LocalAccount = {
    username: username.trim().toLowerCase(),
    salt: toBase64(salt),
    passwordHash: toBase64(passwordHash),
  };
  window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, 'active');
}

export async function loginLocalAccount(
  username: string,
  password: string,
): Promise<boolean> {
  const account = getLocalAccount();
  if (!account || account.username !== username.trim().toLowerCase()) return false;

  const actualHash = await hashPassword(password, fromBase64(account.salt));
  const expectedHash = fromBase64(account.passwordHash);
  if (actualHash.length !== expectedHash.length) return false;

  let difference = 0;
  for (let index = 0; index < actualHash.length; index += 1) {
    difference |= actualHash[index] ^ expectedHash[index];
  }
  if (difference !== 0) return false;

  window.sessionStorage.setItem(SESSION_STORAGE_KEY, 'active');
  return true;
}

export function logoutLocalAccount(): void {
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}
