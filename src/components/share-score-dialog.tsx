/**
 * Share a score.
 *
 * Two products, so this serves both: an Objective Score card and a ValScore
 * card, same layout, different label. Whichever page opened it decides which.
 *
 * DESIGN, approved by Andrew 2026-09-18:
 *  - Everything is included by default and each line can be switched off. Most
 *    owners will drop the valuation; some will not, and that is their call to
 *    make rather than ours to make for them.
 *  - The score itself cannot be switched off. It is the thing being shared.
 *  - The band label appears nowhere. It is internal for now.
 *  - Everything on the card is centred.
 *
 * The card is drawn on a canvas rather than screenshotted from the DOM, so it
 * needs no extra dependency, renders identically on every machine, and the file
 * a client posts is the file we drew.
 *
 * WHAT LINKEDIN WILL AND WILL NOT DO. There is no way to hand LinkedIn an image
 * from a web page: its share endpoints take a URL, and every page in this
 * product is behind a sign-in, so there is no public URL to give it. The honest
 * maximum is to download the image and open LinkedIn's composer with the text
 * ready, leaving the client to attach the file that just landed in their
 * downloads. The button says so rather than implying it posts for them.
 */

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share2 } from "lucide-react";
import { formatValuationRange } from "@/lib/score-display";

export type ShareVariant = "objective" | "valscore";

const W = 1200;
const H = 630;

const NAVY = "#0e1c2b";
const TEAL = "#4fc0ba";
const MUTED = "#9fb3c4";
const WORDMARK = "#8fb6b4";
const FAINT = "#7d94a4";

type Options = {
  company: boolean;
  value: boolean;
  date: boolean;
};

/** Draw the card. Pure: same inputs, same pixels. */
function drawCard(
  canvas: HTMLCanvasElement,
  opts: {
    variant: ShareVariant;
    score: number;
    company: string;
    midpoint: number | null;
    completedOn: Date | null;
    show: Options;
  },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);

  /* The ruled field from the email header, drawn the same way: fine diagonals,
     low contrast, decoration that survives being scaled down to a thumbnail. */
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth = 1;
  for (let x = -H; x < W + H; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.stroke();
  }
  ctx.restore();

  const cx = W / 2;
  ctx.textAlign = "center";

  ctx.fillStyle = WORDMARK;
  ctx.font = "700 20px Helvetica, Arial, sans-serif";
  ctx.fillText("K R I T E R I O N", cx, 92);

  ctx.fillStyle = TEAL;
  ctx.font = "700 190px Helvetica, Arial, sans-serif";
  ctx.fillText(String(Math.round(opts.score)), cx, 300);

  ctx.fillStyle = MUTED;
  ctx.font = "700 24px Helvetica, Arial, sans-serif";
  ctx.fillText(
    opts.variant === "valscore" ? "V A L S C O R E" : "O B J E C T I V E   S C O R E",
    cx,
    348,
  );

  let y = 424;
  if (opts.show.company && opts.company.trim()) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 38px Helvetica, Arial, sans-serif";
    ctx.fillText(opts.company.trim(), cx, y);
    y += 46;
  }

  if (opts.show.value && opts.midpoint != null) {
    ctx.fillStyle = "#b9cbd6";
    ctx.font = "400 27px Helvetica, Arial, sans-serif";
    ctx.fillText(`Indicative value ${formatValuationRange(opts.midpoint)}`, cx, y);
    y += 40;
  }

  if (opts.show.date && opts.completedOn) {
    ctx.fillStyle = FAINT;
    ctx.font = "400 21px Helvetica, Arial, sans-serif";
    ctx.fillText(
      opts.completedOn.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      cx,
      y,
    );
  }

  ctx.fillStyle = FAINT;
  ctx.font = "400 20px Helvetica, Arial, sans-serif";
  ctx.fillText("kriterionbvi.com", cx, H - 52);
}

export function ShareScoreDialog({
  open,
  onOpenChange,
  variant,
  score,
  company,
  midpoint,
  completedOn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: ShareVariant;
  score: number;
  company: string;
  /** Null where no income figure is on file, in which case there is no value to share. */
  midpoint: number | null;
  /** Null where the submission carries no timestamp. The line is then omitted
   *  rather than filled with today, which is a date nobody recorded. */
  completedOn: Date | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [show, setShow] = useState<Options>({ company: true, value: true, date: true });

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    drawCard(canvasRef.current, { variant, score, company, midpoint, completedOn, show });
  }, [open, variant, score, company, midpoint, completedOn, show]);

  const label = variant === "valscore" ? "ValScore" : "Objective Score";

  function fileName() {
    const safe = company
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    return `${safe || "kriterion"}-${variant === "valscore" ? "valscore" : "objective-score"}.png`;
  }

  function downloadImage() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = fileName();
    link.click();
  }

  function openLinkedIn() {
    downloadImage();
    const text =
      variant === "valscore"
        ? `My ValScore is ${Math.round(score)}. Kriterion assesses what a buyer would conclude about a business before they make an offer.`
        : `My Objective Score is ${Math.round(score)}. Kriterion scores the areas a buyer works through before they make an offer.`;
    window.open(
      `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Share your {label}</DialogTitle>
          <DialogDescription>
            Choose what goes on the card. Nothing is shared until you pick where it goes.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border border-border">
          <canvas ref={canvasRef} className="block w-full" style={{ aspectRatio: "1200 / 630" }} />
        </div>

        <div className="mt-1">
          <Row
            checked
            disabled
            label={`Your ${label}`}
            note={`${Math.round(score)}. Always included, this is the point of the card.`}
            onChange={() => undefined}
          />
          <Row
            checked={show.company}
            label="Company name"
            note={company.trim() || "Not on file"}
            disabled={!company.trim()}
            onChange={(v) => setShow((s) => ({ ...s, company: v }))}
          />
          <Row
            checked={show.value}
            label="Indicative value"
            note={midpoint != null ? formatValuationRange(midpoint) : "No income figure on file"}
            disabled={midpoint == null}
            onChange={(v) => setShow((s) => ({ ...s, value: v }))}
          />
          <Row
            checked={show.date}
            label="Date completed"
            note={
              completedOn
                ? completedOn.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "Not on file"
            }
            disabled={completedOn == null}
            onChange={(v) => setShow((s) => ({ ...s, date: v }))}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={downloadImage}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download the image
          </Button>
          <Button onClick={openLinkedIn}>
            <Share2 className="mr-1.5 h-3.5 w-3.5" />
            Post to LinkedIn
          </Button>
        </DialogFooter>
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          LinkedIn does not let a website attach an image for you. Posting downloads the card and
          opens LinkedIn with your text ready, and you attach the file from there.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  checked,
  label,
  note,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  note: string;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 border-t border-border/70 py-2.5 ${
        disabled ? "cursor-default opacity-60" : ""
      }`}
    >
      <input
        type="checkbox"
        className="mt-[3px] h-4 w-4 accent-[#1f8a86]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold">{label}</span>
        <span className="block text-[12px] leading-snug text-muted-foreground">{note}</span>
      </span>
    </label>
  );
}
