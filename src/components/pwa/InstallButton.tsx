import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The browser fires `beforeinstallprompt` once, possibly before any component mounts,
// so it is captured at module load and shared with every mounted button.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  notify();
});
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  notify();
});

// iOS never fires `beforeinstallprompt`; installing is a manual Share -> Add to Home Screen.
function isIosNotInstalled() {
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS reports as Mac
  return isIos && !(navigator as Navigator & { standalone?: boolean }).standalone;
}

function IosInstallHint() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Install app">
          <Download className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Install app</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="text-sm">
        <p className="font-medium mb-2">Add Vyas to your Home Screen</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Tap the <Share className="inline h-4 w-4 align-text-bottom" /> Share button in Safari.
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>.
          </li>
          <li>
            Tap <strong>Add</strong>.
          </li>
        </ol>
      </PopoverContent>
    </Popover>
  );
}

export function InstallButton() {
  const [, rerender] = useState(0);

  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (!deferredPrompt) return isIosNotInstalled() ? <IosInstallHint /> : null;

  const handleInstall = async () => {
    const prompt = deferredPrompt;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    // A prompt event can only be used once.
    deferredPrompt = null;
    notify();
  };

  return (
    <Button variant="outline" size="sm" onClick={handleInstall} aria-label="Install app">
      <Download className="h-4 w-4 sm:mr-2" />
      <span className="hidden sm:inline">Install app</span>
    </Button>
  );
}
