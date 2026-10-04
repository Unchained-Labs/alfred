import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { db } from "@/db";
import { authChallenges, passkeys, users, type User } from "@/db/schema";
import { InputError } from "@/lib/errors";
import {
  claimOrphanedData,
  findUsableInvite,
  findUserByEmail,
  normalizeEmail,
  userCount,
} from "@/lib/auth";
import { invites } from "@/db/schema";

/**
 * Passkey (WebAuthn) ceremonies.
 *
 * Two modes. "device" uses whatever this machine has — Touch ID, Windows
 * Hello, a security key. "phone" asks the browser for the cross-device flow,
 * which is what produces the QR code: scan it with a phone, approve with Face
 * ID, and the passkey is saved in that phone's keychain. The browser decides
 * how to present it; `hints: ["hybrid"]` plus `preferredAuthenticatorType:
 * "remoteDevice"` is how you ask for the QR path rather than a local prompt.
 */

export interface RelyingParty {
  /** Must match the page's hostname exactly — e.g. "alfred.example.com". */
  rpID: string;
  /** Full origin — e.g. "https://alfred.example.com". */
  origin: string;
}

export type CeremonyMode = "device" | "phone";

const RP_NAME = "Alfred";
const CHALLENGE_TTL_MS = 5 * 60_000;

/* ------------------------------------------------------------------ *
 * Challenges
 * ------------------------------------------------------------------ */

function saveChallenge(
  row: Omit<typeof authChallenges.$inferInsert, "id" | "expiresAt">,
): string {
  const id = randomBytes(18).toString("base64url");
  // Opportunistic sweep: expired rows are useless and nothing else deletes
  // them, so the table would grow forever on a box nobody prunes.
  db.delete(authChallenges).where(lt(authChallenges.expiresAt, new Date())).run();
  db.insert(authChallenges)
    .values({ ...row, id, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) })
    .run();
  return id;
}

/** Read a challenge and delete it. Single use, even on failure. */
function takeChallenge(
  id: string | undefined,
  kind: (typeof authChallenges.$inferSelect)["kind"],
) {
  if (!id) throw new InputError("That sign-in attempt expired. Try again.");
  const row = db
    .select()
    .from(authChallenges)
    .where(and(eq(authChallenges.id, id), eq(authChallenges.kind, kind)))
    .get();
  // Deleted before it is validated: a challenge that failed verification must
  // not be replayable either.
  db.delete(authChallenges).where(eq(authChallenges.id, id)).run();
  if (!row || row.expiresAt.getTime() < Date.now()) {
    throw new InputError("That sign-in attempt expired. Try again.");
  }
  return row;
}

const hintsFor = (mode: CeremonyMode) =>
  mode === "phone" ? (["hybrid"] as const) : undefined;

/* ------------------------------------------------------------------ *
 * Sign-up / adding a passkey
 * ------------------------------------------------------------------ */

export async function beginRegistration(
  rp: RelyingParty,
  opts: {
    mode: CeremonyMode;
    name?: string;
    email?: string;
    user?: User;
    inviteToken?: string;
  },
) {
  const existing = opts.user
    ? db
        .select({ id: passkeys.id, transports: passkeys.transports })
        .from(passkeys)
        .where(eq(passkeys.userId, opts.user.id))
        .all()
    : [];

  let pending: Record<string, string> | null = null;
  let userId: string;
  let displayName: string;

  if (opts.user) {
    userId = opts.user.id;
    displayName = opts.user.name || opts.user.email;
  } else if (opts.inviteToken) {
    // An invitation carries its own address and role, so neither is taken
    // from the request: accepting an invite must not let you choose to be
    // the owner, or to claim an address the owner did not write down.
    const invite = findUsableInvite(opts.inviteToken);
    if (!invite)
      throw new InputError("That invitation is invalid, used, or expired.");
    if (findUserByEmail(invite.email)) {
      throw new InputError(
        "An account with that email already exists. Sign in instead.",
      );
    }
    userId = randomUUID();
    displayName = (opts.name ?? "").trim().slice(0, 60) || invite.email;
    pending = {
      userId,
      email: invite.email,
      name: displayName,
      inviteId: invite.id,
      role: invite.role,
    };
  } else {
    const email = normalizeEmail(opts.email ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new InputError("That does not look like an email address.");
    }
    if (findUserByEmail(email)) {
      throw new InputError(
        "An account with that email already exists. Sign in instead.",
      );
    }
    if (!signupAllowed()) {
      throw new InputError(
        "Sign-up is closed on this instance. Ask the owner for an invite link.",
      );
    }
    // The account id is chosen HERE, before the passkey exists, because
    // WebAuthn binds the credential to the user handle it was shown. Creating
    // the row first instead would leave an account behind every abandoned
    // ceremony.
    userId = randomUUID();
    displayName = (opts.name ?? "").trim().slice(0, 60) || email;
    pending = { userId, email, name: displayName };
  }

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpID,
    userName: opts.user ? opts.user.email : (pending?.email ?? displayName),
    userDisplayName: displayName,
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    // Stops the browser silently making a second passkey for an account that
    // already has one on this device.
    excludeCredentials: existing.map((p) => ({
      id: p.id,
      transports: (p.transports ?? undefined) as never,
    })),
    authenticatorSelection: {
      residentKey: "required", // discoverable: sign in without typing an email
      userVerification: "preferred",
    },
    preferredAuthenticatorType: opts.mode === "phone" ? "remoteDevice" : undefined,
  });

  const hints = hintsFor(opts.mode);
  const challengeId = saveChallenge({
    kind: opts.user ? "add_passkey" : "register",
    challenge: options.challenge,
    userId: opts.user?.id ?? null,
    pending,
  });

  return {
    challengeId,
    options: hints ? { ...options, hints: [...hints] } : options,
  };
}

/**
 * Verify a new passkey. Creates the account on sign-up.
 *
 * The first account to exist becomes the owner and claims any data that
 * predates accounts — Alfred ran without them for a while, and those rows
 * carry a null user_id until somebody adopts them.
 */
export async function finishRegistration(
  rp: RelyingParty,
  challengeId: string | undefined,
  response: RegistrationResponseJSON,
  opts: { label?: string; signedInUser?: User } = {},
): Promise<{ user: User; claimed: number }> {
  const challenge = takeChallenge(
    challengeId,
    opts.signedInUser ? "add_passkey" : "register",
  );
  if (opts.signedInUser && challenge.userId !== opts.signedInUser.id) {
    throw new InputError("That passkey belongs to a different sign-in attempt.");
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new InputError("That passkey could not be verified.");
  }
  const info = verification.registrationInfo;

  let user: User;
  let claimed = 0;

  if (opts.signedInUser) {
    user = opts.signedInUser;
  } else {
    const pending = (challenge.pending ?? {}) as Record<string, string>;
    const email = normalizeEmail(pending.email ?? "");
    if (!email) throw new InputError("That sign-in attempt expired. Try again.");
    // Re-checked after the ceremony, not just before it: two people can start
    // sign-up with the same address at the same time, and only one row can win.
    if (findUserByEmail(email)) {
      throw new InputError(
        "An account with that email already exists. Sign in instead.",
      );
    }
    const first = userCount() === 0;
    const role = first
      ? "owner"
      : ((pending.role as "owner" | "member") ?? "member");
    user = db
      .insert(users)
      .values({
        id: pending.userId,
        email,
        name: pending.name ?? "",
        // No password. This account signs in with the passkey below.
        passwordHash: null,
        role,
      })
      .returning()
      .get();
    if (pending.inviteId) {
      db.update(invites)
        .set({ acceptedAt: new Date() })
        .where(eq(invites.id, pending.inviteId))
        .run();
    }
    if (first) claimed = claimOrphanedData(user.id);
  }

  db.insert(passkeys)
    .values({
      id: info.credential.id,
      userId: user.id,
      publicKey: Buffer.from(info.credential.publicKey),
      counter: info.credential.counter,
      transports: info.credential.transports ?? null,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      name: opts.label?.slice(0, 60) || guessLabel(info.credential.transports),
      lastUsedAt: new Date(),
    })
    .run();

  return { user, claimed };
}

function guessLabel(transports: string[] | undefined): string {
  if (transports?.includes("hybrid")) return "Phone";
  if (transports?.includes("internal")) return "This device";
  if (transports?.includes("usb") || transports?.includes("nfc"))
    return "Security key";
  return "Passkey";
}

/* ------------------------------------------------------------------ *
 * Sign-in
 * ------------------------------------------------------------------ */

export async function beginLogin(rp: RelyingParty, mode: CeremonyMode) {
  // No allow-list: the credentials are discoverable, so the authenticator
  // offers the accounts it holds and we learn who it is from the response.
  // That is what lets the button say "Sign in" rather than asking for an
  // email first.
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: "preferred",
  });
  const challengeId = saveChallenge({
    kind: "login",
    challenge: options.challenge,
  });
  const hints = hintsFor(mode);
  return {
    challengeId,
    options: hints ? { ...options, hints: [...hints] } : options,
  };
}

export async function finishLogin(
  rp: RelyingParty,
  challengeId: string | undefined,
  response: AuthenticationResponseJSON,
): Promise<User> {
  const challenge = takeChallenge(challengeId, "login");

  const credential = db
    .select()
    .from(passkeys)
    .where(eq(passkeys.id, response.id))
    .get();
  if (!credential) {
    throw new InputError(
      "That passkey is not registered here. Create an account, or use the device you signed up with.",
    );
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    credential: {
      id: credential.id,
      publicKey: new Uint8Array(credential.publicKey as Buffer),
      counter: credential.counter,
      transports: (credential.transports ?? undefined) as never,
    },
    requireUserVerification: false,
  });
  if (!verification.verified)
    throw new InputError("That passkey could not be verified.");

  db.update(passkeys)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    })
    .where(eq(passkeys.id, credential.id))
    .run();

  const user = db.select().from(users).where(eq(users.id, credential.userId)).get();
  if (!user) throw new InputError("That account no longer exists.");
  if (user.disabledAt) throw new InputError("That account has been suspended.");
  return user;
}

/* ------------------------------------------------------------------ *
 * Management
 * ------------------------------------------------------------------ */

export function listPasskeys(userId: string) {
  return db
    .select({
      id: passkeys.id,
      name: passkeys.name,
      deviceType: passkeys.deviceType,
      backedUp: passkeys.backedUp,
      createdAt: passkeys.createdAt,
      lastUsedAt: passkeys.lastUsedAt,
    })
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
    .all();
}

export function renamePasskey(userId: string, id: string, name: string) {
  const label = name.trim().slice(0, 60);
  if (!label) throw new InputError("Give the passkey a name.");
  db.update(passkeys)
    .set({ name: label })
    .where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)))
    .run();
}

/**
 * Remove a passkey — but never the last one of an account that has no
 * password, because that account would have no way back in.
 */
export function deletePasskey(user: User, id: string) {
  const remaining = listPasskeys(user.id).length - 1;
  if (remaining <= 0 && !user.passwordHash) {
    throw new InputError(
      "That is your only passkey and this account has no password. Add another passkey first.",
    );
  }
  db.delete(passkeys)
    .where(and(eq(passkeys.id, id), eq(passkeys.userId, user.id)))
    .run();
}

export function passkeyCount(userId: string): number {
  return listPasskeys(userId).length;
}

/* ------------------------------------------------------------------ *
 * Policy and relying party
 * ------------------------------------------------------------------ */

/**
 * The first account can always be created, otherwise sign-up is open only
 * when ALFRED_ALLOW_SIGNUP says so. Invites work regardless — they are a
 * deliberate act by the owner, which is a different question from whether a
 * stranger who reaches the page may create an account.
 */
export function signupAllowed(): boolean {
  if (userCount() === 0) return true;
  return /^(1|true|yes|on)$/i.test(process.env.ALFRED_ALLOW_SIGNUP ?? "");
}

/**
 * Relying party for this request.
 *
 * A passkey is bound to the rpID it was created with, so this has to be the
 * hostname the browser actually shows — and behind a reverse proxy the
 * request's own Host is the internal one. ALFRED_PUBLIC_URL settles it.
 * Getting this wrong does not raise an error: the passkey is simply never
 * offered, and sign-in looks broken for no visible reason.
 */
export function relyingParty(requestUrl: string, headers: Headers): RelyingParty {
  const configured = process.env.ALFRED_PUBLIC_URL?.replace(/\/+$/, "");
  let origin: string;
  if (configured) {
    origin = configured;
  } else {
    const url = new URL(requestUrl);
    const proto = (
      headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
    )
      .split(",")[0]
      .trim();
    const host = (
      headers.get("x-forwarded-host") ??
      headers.get("host") ??
      url.host
    )
      .split(",")[0]
      .trim();
    origin = `${proto}://${host}`;
  }
  const rpID = process.env.ALFRED_RP_ID || new URL(origin).hostname;
  return { rpID, origin };
}
