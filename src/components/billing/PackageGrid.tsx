"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";

import { CreditGlyph } from "./CreditGlyph";
import { PayDialog } from "./PayDialog";

type Pack = {
  id: string;
  name: string;
  credits: number;
  price_cny: number;
  featured?: boolean;
  desc: string;
};

export function PackageGrid({ packages }: { packages: Pack[] }) {
  const [chosen, setChosen] = useState<Pack | null>(null);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        {packages.map((p) => (
          <div
            key={p.id}
            className="relative rounded-card p-5"
            style={{
              background: "var(--card)",
              border: p.featured ? "2px solid var(--ink)" : "1px solid var(--line-soft)",
            }}
          >
            {p.featured && (
              <span
                className="absolute -top-2.5 right-4 rounded-pill px-2.5 py-[3px] text-[11px] font-semibold"
                style={{ background: "var(--ink)", color: "#fff" }}
              >
                最多人选
              </span>
            )}
            <div className="mb-1.5 text-[15px] font-semibold">{p.name}</div>
            {/* 先讲能做什么，数字放后面 */}
            <p
              className="min-h-[66px] text-[13px] leading-relaxed"
              style={{ color: "var(--slate)" }}
            >
              {p.desc}
            </p>
            <div className="my-3 flex items-baseline justify-between">
              <span className="inline-flex items-center gap-1.5 font-display text-[15px] font-semibold">
                <CreditGlyph size={9} />
                {p.credits}
              </span>
              <span className="font-display text-[24px] font-semibold tracking-tight">
                ¥{p.price_cny}
              </span>
            </div>
            <Button
              className="w-full"
              variant={p.featured ? "primary" : "secondary"}
              onClick={() => setChosen(p)}
            >
              选这个
            </Button>
          </div>
        ))}
      </div>

      {chosen && <PayDialog pack={chosen} onClose={() => setChosen(null)} />}
    </>
  );
}
