"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetrikaLogo } from "@/components/layout/metrika-logo";
import { Lock, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Identifiants incorrects. Accès refusé.");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panneau marine de marque */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy-950 p-12 text-white lg:flex">
        <div className="absolute inset-0 bg-navy-grain" />
        <div className="relative">
          <MetrikaLogo variant="light" />
        </div>
        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-semibold leading-tight">
            Vos documents BTP,
            <span className="italic text-gold-400"> du métré au devis.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-navy-100/70">
            CCTP, DPGF, sous-détails de prix, bibliothèque de prix et devis —
            une plateforme privée et soignée pour le métrage et le chiffrage BTP.
          </p>
        </div>
        <div className="premium-divider relative h-px w-full" />
      </div>

      {/* Formulaire */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 lg:hidden">
            <MetrikaLogo />
          </div>
          <div className="mb-8">
            <span className="inline-flex items-center gap-2 rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold text-gold-800">
              <Lock className="size-3" /> Accès privé
            </span>
            <h2 className="mt-4 font-display text-2xl font-semibold text-navy-900">
              Connexion sécurisée
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Espace réservé à l’utilisateur autorisé.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Adresse e-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@metrika.ma" required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" variant="gold" size="lg" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              {loading ? "Connexion…" : "Se connecter"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            2FA optionnelle · disponible prochainement
          </p>
        </div>
      </div>
    </div>
  );
}
