import Image from "next/image";

// Proofly 品牌字标（含「Proofly」字样与 P 内绿色对勾）。
// 两个色版：ink（深色字，用于浅色背景）、white（白色字，用于深色侧栏）。
// 资源在 public/：proofly-logo-dark.png（ink）/ proofly-logo.png（white）。
const NATURAL_W = 1400;
const NATURAL_H = 362;
const RATIO = NATURAL_W / NATURAL_H;

export function LogoWordmark({
  height = 24,
  tone = "ink",
  priority = false,
  className,
}: {
  height?: number;
  tone?: "ink" | "white";
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={tone === "white" ? "/proofly-logo.png" : "/proofly-logo-dark.png"}
      alt="Proofly"
      width={NATURAL_W}
      height={NATURAL_H}
      priority={priority}
      className={className}
      style={{ height, width: Math.round(height * RATIO), objectFit: "contain" }}
    />
  );
}
