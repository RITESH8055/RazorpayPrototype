import { useMemo, useState } from "react";
import { useCase } from "../state/store";
import { Button, Card, Chip, Eyebrow } from "../components/ui";
import { VolumeChart } from "../components/charts";
import { inr, splitOrders } from "../lib/features";
import { GENERAL_WARNING } from "../lib/guardrails";
import type { Merchant, Scenario } from "../lib/types";

const NAMES = ["Ananya Sharma", "Rohit Verma", "Priya Nair", "Karan Mehta", "Sneha Iyer", "Arjun Rao", "Meera Joshi", "Vikram Singh"];
const CITIES = ["Pune", "Lucknow", "Kochi", "Indore", "Chennai", "Delhi", "Surat", "Nagpur"];

const maskName = (n: string) => n.split(" ").map((p) => p[0] + "***").join(" ");

export interface PackItem {
  id: string;
  title: string;
  desc: string;
  preview?: string[];
}

export function packItems(s: Scenario, m: Merchant): PackItem[] {
  const active = (id: string) => {
    const st = m.sources.find((x) => x.id === id)?.status;
    return st === "verified" || st === "consented";
  };
  const items: PackItem[] = [];
  if (s.offer) items.push({ id: "offer", title: "Offer page snapshot", desc: `${s.offer.url} · "${s.offer.text}"` });
  if (active("bank")) {
    const bank = m.sources.find((x) => x.id === "bank")!;
    items.push({ id: "bank", title: "Bank history summary", desc: bank.details.map((d) => `${d.label}: ${d.value}`).join(" · ") });
  }
  const top = [...splitOrders(s).spike].sort((a, b) => b.amount - a.amount).slice(0, 4);
  items.push({
    id: "delivery",
    title: "Delivery confirmations for flagged orders",
    desc: "Highest-value orders in the spike, with courier proof of delivery. Customer fields masked.",
    preview: top.map((o, i) => `${o.id} · ${inr(o.amount)} · ${maskName(NAMES[i % NAMES.length])} · +91 9XXXX XX${(31 + i * 17) % 100} · ${CITIES[i % CITIES.length]}`),
  });
  if (active("gst")) {
    const gst = m.sources.find((x) => x.id === "gst")!;
    items.push({ id: "gst", title: "GST filing status", desc: gst.details.map((d) => `${d.label}: ${d.value}`).join(" · ") });
  }
  return items;
}

export default function SpikeScreen() {
  const { scenario, merchant, features, cs, effective, dispatch } = useCase();
  const [selected, setSelected] = useState<string[]>([]);
  const items = useMemo(() => packItems(scenario, merchant), [scenario, merchant]);
  const kept = items.filter((i) => !cs.removedItems.includes(i.id));
  const removed = items.filter((i) => cs.removedItems.includes(i.id));
  const explained = effective.recommendation.label === "explained" && effective.recommendation.recommended_action === "partial_release";
  const locked = cs.packStatus !== "draft";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-md bg-brand px-5 py-4 text-white">
        <div className="font-display text-3xl font-semibold">{features.volume_multiple}x</div>
        <div className="min-w-[280px] flex-1">
          <div className="font-display text-[17px] font-semibold">
            Your sales are {features.volume_multiple}x your usual level. We've prepared a readiness pack so your settlements keep moving.
          </div>
          <div className="text-[12px] text-white/80">
            {features.spike_orders} orders in the last 24 hours vs about {features.baseline_orders_per_day} on a usual day
          </div>
        </div>
        <Chip tone="accent">Festive sale detected</Chip>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-4">
          <Card title="Orders per hour vs your usual level" right={<span className="text-[11px] text-ink-muted">last 48 hours</span>}>
            <VolumeChart s={scenario} from={48} height={200} />
            <div className="mt-1 flex gap-4 text-[11px] text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-brand" />
                Orders
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-4 border-t-2 border-dashed border-ink" />
                Usual level
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-sm bg-brand/10" />
                Sale window
              </span>
            </div>
          </Card>

          {explained ? (
            <div className="rounded-md border border-positive/30 bg-positive-wash p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-positive">Settlement outlook</div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink">{effective.recommendation.merchant_message}</p>
            </div>
          ) : (
            <div className="rounded-md border border-line bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Heads up</div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink">{GENERAL_WARNING}</p>
            </div>
          )}
        </div>

        <Card
          id="pack"
          title="Readiness pack"
          right={
            <Chip tone={cs.packStatus === "shared" ? "positive" : cs.packStatus === "stopped" ? "danger" : "neutral"}>
              {cs.packStatus === "shared" ? `Shared · ${kept.length} items` : cs.packStatus === "stopped" ? "Sharing stopped" : "Not shared yet"}
            </Chip>
          }
        >
          <p className="mb-3 text-[12px] text-ink-body">Only the orders in question go in. You choose what Razorpay's risk team can see, and you can stop sharing at any time.</p>
          <ul className="space-y-2">
            {kept.map((item) => (
              <li key={item.id} className="rounded-md border border-line p-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-[#305EFF]"
                    disabled={locked}
                    checked={selected.includes(item.id)}
                    onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, item.id] : cur.filter((x) => x !== item.id)))}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">{item.title}</div>
                    <div className="text-[12px] text-ink-muted">{item.desc}</div>
                    {item.preview && (
                      <ul className="mt-1.5 space-y-0.5 rounded-sm bg-surface-alt px-2 py-1.5 font-mono text-[11px] text-ink-body">
                        {item.preview.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </label>
              </li>
            ))}
            {removed.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-md border border-dashed border-line px-3 py-2 text-[12px] text-ink-subtle">
                <span className="line-through">{item.title}</span>
                {!locked && (
                  <button className="font-semibold text-brand-dark" onClick={() => dispatch({ type: "toggleItem", item: item.id, removed: false })}>
                    Add back
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            {cs.packStatus !== "shared" && (
              <Button onClick={() => dispatch({ type: "pack", status: "shared" })} disabled={kept.length === 0}>
                {cs.packStatus === "stopped" ? "Share again" : "Approve and share"}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={locked || selected.length === 0}
              onClick={() => {
                selected.forEach((id) => dispatch({ type: "toggleItem", item: id, removed: true }));
                setSelected([]);
              }}
            >
              Remove selected{selected.length ? ` (${selected.length})` : ""}
            </Button>
            <Button variant="danger" disabled={cs.packStatus === "stopped"} onClick={() => dispatch({ type: "pack", status: "stopped" })}>
              Stop sharing
            </Button>
            {cs.packStatus === "shared" && (
              <Button variant="ghost" className="ml-auto" onClick={() => dispatch({ type: "screen", screen: "review" })}>
                Switch to analyst view →
              </Button>
            )}
          </div>
          <div className="mt-3">
            <Eyebrow>What happens next</Eyebrow>
            <p className="text-[12px] text-ink-body">A Razorpay analyst reviews the pack. A person decides every settlement change; the AI only recommends.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
