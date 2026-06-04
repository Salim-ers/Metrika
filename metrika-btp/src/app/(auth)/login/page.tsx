"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetrikaLogo } from "@/components/layout/metrika-logo";
import { Lock, Loader2, ArrowRight } from "lucide-react";

gsap.registerPlugin(useGSAP);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".anim-brand", { opacity: 0, y: 28, scale: 0.96, duration: 0.8 })
        .from(".anim-tagline", { opacity: 0, y: 18, duration: 0.6, stagger: 0.12 }, "-=0.4")
        .from(".anim-form > *", { opacity: 0, y: 16, duration: 0.5, stagger: 0.08 }, "-=0.45");
      // halos dorés flottants (boucle douce)
      gsap.to(".glow-1", { y: 36, x: 22, duration: 6, repeat: -1, yoyo: true, ease: "sine.inOut" });
      gsap.to(".glow-2", { y: -28, x: -18, duration: 7.5, repeat: -1, yoyo: true, ease: "sine.inOut" });
    },
    { scope: root },
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Identifiants incorrects. Accès refusé.");
      gsap.fromTo(".login-form-card", { x: -8 }, { x: 0, duration: 0.4, ease: "elastic.out(1,0.4)" });
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div ref={root} className="grid min-h-screen lg:grid-cols-2">
      {/* ── Panneau marine animé ── */}
      <div className="relative hidden flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-950 p-12 text-white lg:flex">
        <div className="absolute inset-0 bg-navy-grain opacity-60" />
        <div className="glow-1 pointer-events-none absolute -top-12 left-1/4 size-80 rounded-full bg-gold-500/25 blur-3xl" />
        <div className="glow-2 pointer-events-none absolute -bottom-16 right-1/4 size-96 rounded-full bg-gold-400/10 blur-3xl" />

        <div className="relative flex flex-col items-center text-center">
          <div className="anim-brand">
            <MetrikaLogo variant="light" size="xl" />
          </div>
          <p className="anim-tagline mt-10 max-w-md font-display text-2xl font-semibold leading-snug text-navy-100/80">
            Votre plateforme privée de{" "}
            <span className="italic text-gold-400">métrage</span> et de{" "}
            <span className="italic text-gold-400">chiffrage</span> BTP.
          </p>
        </div>

        <div className="anim-tagline absolute bottom-8 text-[11px] uppercase tracking-[0.25em] text-navy-100/30">
          Accès réservé
        </div>
      </div>

      {/* ── Formulaire ── */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="login-form-card w-full max-w-sm">
          <div className="anim-brand mb-8 flex justify-center lg:hidden">
            <MetrikaLogo size="lg" />
          </div>

          <div className="anim-form">
            <span className="inline-flex items-center gap-2 rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold text-gold-800">
              <Lock className="size-3" /> Accès privé
            </span>
            <div className="mt-4">
              <h2 className="font-display text-3xl font-semibold text-navy-900">Connexion sécurisée</h2>
              <p className="mt-1 text-sm text-muted-foreground">Espace réservé à l’utilisateur autorisé.</p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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

              <Button type="submit" variant="gold" size="lg" className="group w-full" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                {loading ? "Connexion…" : "Se connecter"}
                {!loading && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              2FA optionnelle · disponible prochainement
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
