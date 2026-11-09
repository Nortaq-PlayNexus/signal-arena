import { useEffect, useState } from "react";
import { armAudio } from "@/core/audio";
import { StartScreen, type MatchConfig } from "@/ui/StartScreen";
import { Stage } from "@/ui/Stage";

export default function App() {
  const [match, setMatch] = useState<MatchConfig | null>(null);

  // the sound desk is armed on the first gesture anywhere on the page
  useEffect(() => {
    armAudio();
  }, []);

  return (
    <div className="min-h-screen bg-rack text-cream">
      {match ? (
        <Stage config={match} onExit={() => setMatch(null)} />
      ) : (
        <StartScreen onStart={setMatch} />
      )}
    </div>
  );
}
