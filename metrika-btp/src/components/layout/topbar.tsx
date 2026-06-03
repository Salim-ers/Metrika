import { Search, Bell } from "lucide-react";
import { signOut, auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export async function Topbar() {
  const session = await auth();
  const initial = (session?.user?.name ?? session?.user?.email ?? "M")[0].toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center gap-4 border-b border-border bg-background/85 px-6 backdrop-blur-md">
      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Rechercher un document, projet, ouvrage…"
          className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="size-5" />
        </Button>

        <div className="flex items-center gap-3 rounded-full border border-border bg-card py-1 pl-1 pr-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-navy-700 text-sm font-semibold text-white">
            {initial}
          </div>
          <span className="hidden text-sm font-medium text-navy-800 sm:block">
            {session?.user?.name ?? "Administrateur"}
          </span>
        </div>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <Button variant="outline" size="sm" type="submit">
            Déconnexion
          </Button>
        </form>
      </div>
    </header>
  );
}
