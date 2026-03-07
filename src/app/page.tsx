import { auth, signIn, signOut } from "@/lib/auth";
import { listActiveMatches } from "@/lib/redis";
import Link from "next/link";
import type { Match } from "@/lib/types";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function MatchCard({ match }: { match: Match }) {
  return (
    <Link href={`/match/${match.id}`} className="match-card" id={`match-${match.id}`}>
      <div>
        <div className="match-name">{match.name}</div>
        <div className="match-teams">
          {match.homeTeam} vs {match.awayTeam}
        </div>
      </div>
      <span className={`match-status ${match.status}`}>{match.status}</span>
    </Link>
  );
}

export default async function HomePage() {
  const session = await auth();
  let matches: Match[] = [];

  if (session?.user) {
    try {
      matches = await listActiveMatches();
    } catch {
      // Redis not configured yet — that's OK for local dev
    }
  }

  return (
    <main className="landing">
      <div className="landing-header">
        <h1>🏀 Basketball Labeler</h1>
        <p>Tap events as they happen. That&apos;s it.</p>
      </div>

      <div className="auth-section">
        {session?.user ? (
          <>
            <div className="user-info">
              {session.user.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt=""
                  className="user-avatar"
                />
              )}
              <span className="user-name">{session.user.name}</span>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button type="submit" className="sign-out-btn">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("google");
            }}
          >
            <button type="submit" className="auth-btn" id="google-sign-in">
              <GoogleIcon />
              Sign in with Google
            </button>
          </form>
        )}
      </div>

      {session?.user && (
        <div className="match-list">
          <div className="match-list-title">Active Matches</div>
          {matches.length > 0 ? (
            matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))
          ) : (
            <div className="empty-state">
              <p>No active matches right now.</p>
              <p style={{ marginTop: 8, fontSize: "0.8rem" }}>
                An admin will create matches when games start.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
