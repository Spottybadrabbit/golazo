"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { punditFeed, type PunditMessage } from "@/lib/engine";

function timeLabel(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PunditFeed() {
  const [msgs, setMsgs] = useState<PunditMessage[] | null>(null);
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const known = useRef<Set<string>>(new Set());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      const feed = punditFeed(Date.now(), 16);
      const fresh = feed.some((f) => !known.current.has(f.id));
      if (fresh && known.current.size > 0) {
        // brief typing indicator before the new message lands
        setTyping(true);
        timer = setTimeout(() => {
          setTyping(false);
          setMsgs(feed);
          feed.forEach((f) => known.current.add(f.id));
        }, 900);
      } else {
        setMsgs(feed);
        feed.forEach((f) => known.current.add(f.id));
      }
    };
    update();
    const id = setInterval(update, 4000);
    return () => {
      clearInterval(id);
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, typing]);

  return (
    <div>
      {/* bot header */}
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <Image
          src="/assets/mascot.jpg"
          alt="Golo the pundit parrot"
          width={52}
          height={52}
          priority
          className="bob rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold tracking-tight">Golo · PunditBot</h1>
          <p className="flex items-center gap-2 font-mono text-xs text-muted">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-scarlet" />
            watching the TxLINE feed for you
          </p>
        </div>
        <a
          href="https://t.me"
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-bold transition-colors hover:border-scarlet/70 hover:bg-scarlet/10 active:translate-y-px"
        >
          Open in Telegram
          <span className="flex gap-0.5" aria-hidden="true">
            <span className="typing-dot h-1 w-1 rounded-full bg-scarlet" />
            <span className="typing-dot h-1 w-1 rounded-full bg-scarlet" />
            <span className="typing-dot h-1 w-1 rounded-full bg-scarlet" />
          </span>
        </a>
      </div>

      {/* feed */}
      <div className="mt-4 space-y-3">
        {!msgs ? (
          <div className="animate-pulse rounded-2xl border border-line bg-surface p-6 text-center font-mono text-sm text-muted">
            Golo is clearing his throat...
          </div>
        ) : (
          msgs.map((msg) => (
            <div key={msg.id} className="flex items-end gap-2.5">
              <Image
                src="/assets/mascot.jpg"
                alt=""
                width={30}
                height={30}
                className="mb-1 shrink-0 rounded-lg"
              />
              <div
                className={`max-w-[85%] rounded-2xl rounded-bl-md border px-4 py-2.5 text-sm leading-relaxed ${
                  msg.kind === "event"
                    ? "border-scarlet/50 bg-scarlet/10"
                    : "border-line bg-surface"
                }`}
              >
                {msg.text}
                <span className="mt-1 block text-right font-mono text-[10px] text-muted">
                  {timeLabel(msg.at)}
                </span>
              </div>
            </div>
          ))
        )}
        {typing && (
          <div className="flex items-end gap-2.5">
            <Image src="/assets/mascot.jpg" alt="" width={30} height={30} className="mb-1 rounded-lg" />
            <div className="flex gap-1 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3.5">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
