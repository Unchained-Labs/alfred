import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  actionables,
  applications,
  events,
  invites,
  mailMessages,
  questions,
  sessions,
  settings,
  type User,
  type UserRole,
  users,
} from "@/db/schema";
import { InputError } from "@/lib/errors";
import { assertPasswordStrength, hashPassword } from "@/lib/passwords";

export { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "@/lib/passwords";

export const SESSION_COOKIE = "alfred_session";
const SESSION_DAYS = 30;
const INVITE_DAYS = 7;

/* ------------------------------------------------------------------ *
 * Tokens
 * ------------------------------------------------------------------ */

/** 256 bits of entropy, URL-safe. */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the digest is stored, so a database leak is not a set of valid logins. */
function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ */

/**
 * Secure cookies require HTTPS, and Alfred is reached over plain HTTP on
 * localhost during development — a `Secure` cookie there would simply never be
 * sent, and login would appear to silently fail. Set ALFRED_INSECURE_COOKIES=1
 * only if you are deliberately serving plain HTTP somewhere else.
 */
function cookieSecurity() {
  const insecure = process.env.ALFRED_INSECURE_COOKIES === "1";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: !insecure && process.env.NODE_ENV === "production",
    path: "/",
  };
}

export async function createSession(userId: string, userAgent?: string | null) {
  const token = mintToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  db.insert(sessions)
    .values({
      tokenHash: digest(token),
      userId,
      expiresAt,
      userAgent: userAgent?.slice(0, 200) ?? null,
      lastSeenAt: new Date(),
    })
    .run();

  const store = await cookies();
  store.set(SESSION_COOKIE, token, { ...cookieSecurity(), expires: expiresAt });
  return token;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    db.delete(sessions)
      .where(eq(sessions.tokenHash, digest(token)))
      .run();
  }
  store.set(SESSION_COOKIE, "", { ...cookieSecurity(), maxAge: 0 });
}

/** Drops every session for a user — used on password change and on disable. */
export function revokeSessionsFor(userId: string) {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

/**
 * The current user, or null.
 *
 * This is the single place a request is turned into an identity. Everything
 * else takes the user as an argument, so no query can accidentally run
 * unscoped.
 */
export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, digest(token)))
    .get();

  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    db.delete(sessions)
      .where(eq(sessions.tokenHash, digest(token)))
      .run();
    return null;
  }
  if (row.user.disabledAt) return null;

  return row.user;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * requireUser for a PAGE: sends you to sign in instead of throwing.
 *
 * The proxy redirects when there is no session cookie at all, which covers the
 * common case and hides this one: a cookie that EXISTS but no longer resolves
 * — expired, revoked, or pointing at a deleted account — sails past the proxy
 * and then threw UnauthorizedError in the render, which Next turns into a 500
 * error page. Being logged out for a while should not look like a crash.
 *
 * API routes keep the throwing version: a fetch wants 401, not a redirect to
 * an HTML page it cannot use.
 */
export async function requireUserForPage(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireOwner(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "owner") throw new ForbiddenError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in to continue.");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Only the owner can do that.");
    this.name = "ForbiddenError";
  }
}

/** Housekeeping: expired sessions and invites are dead weight. */
export function pruneExpired() {
  const now = new Date();
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
  db.delete(invites)
    .where(and(lt(invites.expiresAt, now), isNull(invites.acceptedAt)))
    .run();
}

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

export function userCount(): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .get()?.n ?? 0
  );
}

/** True before anyone has signed up — the only time /setup is reachable. */
export const needsSetup = () => userCount() === 0;

export function findUserByEmail(email: string): User | undefined {
  return db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .get();
}

/**
 * Does any account still sign in with a password?
 *
 * Decides whether the sign-in screen offers the password form at all. On an
 * Alfred that only ever had passkeys, that link is an invitation to try a
 * credential nobody has.
 */
export function anyPasswordAccounts(): boolean {
  return (
    (db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(isNotNull(users.passwordHash))
      .get()?.n ?? 0) > 0
  );
}

export function listUsers(): User[] {
  return db.select().from(users).orderBy(users.createdAt).all();
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}): Promise<User> {
  const email = normalizeEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new InputError("That does not look like an email address.");
  }
  assertPasswordStrength(input.password);
  if (findUserByEmail(email)) {
    throw new InputError("An account with that email already exists.");
  }

  return db
    .insert(users)
    .values({
      email,
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      role: input.role,
    })
    .returning()
    .get();
}

export async function setPassword(userId: string, password: string) {
  assertPasswordStrength(password);
  db.update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .run();
  // A password change should log out every other device.
  revokeSessionsFor(userId);
}

/* ------------------------------------------------------------------ *
 * Invitations
 * ------------------------------------------------------------------ */

export function createInvite(input: {
  email: string;
  role: UserRole;
  invitedBy: string;
}): { token: string; expiresAt: Date } {
  const email = normalizeEmail(input.email);
  if (findUserByEmail(email)) {
    throw new InputError("That person already has an account.");
  }

  // Re-inviting replaces any outstanding invitation for the same address.
  db.delete(invites)
    .where(and(eq(invites.email, email), isNull(invites.acceptedAt)))
    .run();

  const token = mintToken();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  db.insert(invites)
    .values({
      tokenHash: digest(token),
      email,
      role: input.role,
      invitedBy: input.invitedBy,
      expiresAt,
    })
    .run();

  return { token, expiresAt };
}

export function findUsableInvite(token: string) {
  const invite = db
    .select()
    .from(invites)
    .where(eq(invites.tokenHash, digest(token)))
    .get();
  if (!invite) return null;
  if (invite.acceptedAt) return null;
  if (invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}

export async function acceptInvite(input: {
  token: string;
  name: string;
  password: string;
}): Promise<User> {
  const invite = findUsableInvite(input.token);
  if (!invite) {
    throw new InputError("That invitation is invalid, used, or expired.");
  }

  const user = await createUser({
    email: invite.email,
    name: input.name,
    password: input.password,
    role: invite.role,
  });

  db.update(invites)
    .set({ acceptedAt: new Date() })
    .where(eq(invites.id, invite.id))
    .run();

  return user;
}

export function revokeInvite(id: string) {
  db.delete(invites).where(eq(invites.id, id)).run();
}

export function listInvites() {
  return db
    .select()
    .from(invites)
    .where(isNull(invites.acceptedAt))
    .orderBy(invites.createdAt)
    .all();
}

/* ------------------------------------------------------------------ *
 * Migration from the single-user era
 * ------------------------------------------------------------------ */

/**
 * Assigns every row that predates accounts to the first account created.
 *
 * A database written before accounts existed has rows with a null owner, and
 * those are invisible to every scoped query — so without this the first person
 * to sign in would find their own pipeline empty. Runs once, inside the same
 * transaction that creates the owner.
 */
export function claimOrphanedData(userId: string): number {
  let claimed = 0;

  for (const table of [
    applications,
    actionables,
    questions,
    events,
    mailMessages,
  ]) {
    const result = db
      .update(table)
      .set({ userId })
      .where(isNull(table.userId))
      .run();
    claimed += result.changes;
  }

  // Settings predating accounts carry the profile and provider config.
  const settingsResult = db
    .update(settings)
    .set({ userId })
    .where(isNull(settings.userId))
    .run();
  claimed += settingsResult.changes;

  return claimed;
}

/** Used by the setup route: is there anything to inherit? */
export function orphanedDataCount(): number {
  const n = db
    .select({ n: sql<number>`count(*)` })
    .from(applications)
    .where(isNull(applications.userId))
    .get()?.n;
  return n ?? 0;
}
