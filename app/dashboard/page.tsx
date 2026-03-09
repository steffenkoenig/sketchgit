/**
 * /dashboard – User's drawing collection.
 *
 * Server component: requires authentication (enforced by middleware.ts).
 * Displays all rooms the signed-in user owns or has been added to.
 */
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserRooms } from "@/lib/db/roomRepository";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";

export default async function DashboardPage() {
  const session = await auth();

  // Double-check auth (middleware handles the redirect, but keep this as a guard)
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const userId = (session.user as typeof session.user & { id: string }).id;
  const rooms = await getUserRooms(userId);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-white text-sm flex items-center gap-1">
            ← Canvas
          </Link>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-2">
            <span className="text-lg">⌥</span>
            <span className="font-semibold">My Drawings</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">{session.user.name ?? session.user.email}</span>
          <SignOutButton />
        </div>
      </header>

      {/* Body */}
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Your Drawings</h1>
            <p className="text-slate-400 text-sm mt-1">
              {rooms.length === 0
                ? "No rooms yet. Open the canvas and start drawing!"
                : `${rooms.length} room${rooms.length === 1 ? "" : "s"}`}
            </p>
          </div>

          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            + New Drawing
          </Link>
        </div>

        {rooms.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-slate-800 rounded-xl">
            <div className="text-4xl mb-4">🎨</div>
            <p className="text-slate-400">
              Head to the{" "}
              <Link href="/" className="text-violet-400 hover:underline">
                canvas
              </Link>{" "}
              to create your first drawing.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <Link
                key={room.id}
                href={`/?room=${encodeURIComponent(room.id)}`}
                className="group block bg-[#12121a] border border-slate-800 hover:border-violet-700 rounded-xl p-5 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🖼</span>
                    <span className="font-medium text-sm truncate max-w-[140px]">
                      {room.slug ?? room.id}
                    </span>
                  </div>
                  <RoleBadge role={room.role} />
                </div>

                <div className="text-xs text-slate-500 space-y-1">
                  <div className="flex justify-between">
                    <span>{room.commitCount} commit{room.commitCount === 1 ? "" : "s"}</span>
                    <span>{room.isPublic ? "Public" : "Private"}</span>
                  </div>
                  <div>Updated {formatRelative(room.updatedAt)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function RoleBadge({ role }: { role: "OWNER" | "EDITOR" | "VIEWER" }) {
  const styles: Record<typeof role, string> = {
    OWNER: "bg-violet-900/50 text-violet-300",
    EDITOR: "bg-blue-900/50 text-blue-300",
    VIEWER: "bg-slate-800 text-slate-400",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${styles[role]}`}>
      {role.toLowerCase()}
    </span>
  );
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
