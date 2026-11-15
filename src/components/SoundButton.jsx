import { Volume2 } from "lucide-react";

export default function SoundButton({ onPlay, label = "Nghe phát âm", size = 18 }) {
  return (
    <button
      className="sound"
      onClick={(e) => {
        e.stopPropagation();
        onPlay();
      }}
    >
      <Volume2 size={size} /> {label}
    </button>
  );
}
