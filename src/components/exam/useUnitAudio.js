import { useCallback, useEffect, useRef, useState } from "react";
import { buildScript, createFilePlayer, createTtsPlayer } from "../../lib/examAudio";

// Điều khiển phần nghe của đơn vị đang làm. start() nên được gọi trực tiếp trong sự kiện bấm
// (iPhone chỉ cho phát âm thanh khi có thao tác của người dùng).
export function useUnitAudio(speech) {
  const player = useRef(null);
  const [state, setState] = useState("idle"); // idle | playing | paused | done
  const [line, setLine] = useState(-1);

  const stop = useCallback(() => {
    player.current?.stop();
    player.current = null;
    setState("idle");
    setLine(-1);
  }, []);

  const start = useCallback(
    (unit, rate = 1) => {
      stop();
      const p = unit.audio
        ? createFilePlayer(unit.audio, { rate, onState: setState, onLine: setLine })
        : createTtsPlayer({ voices: speech.voices, voiceURI: speech.voiceURI, rate, onState: setState, onLine: setLine });
      player.current = p;
      p.play(buildScript(unit));
    },
    [speech.voices, speech.voiceURI, stop]
  );

  const pause = useCallback(() => player.current?.pause(), []);
  const resume = useCallback(() => player.current?.resume(), []);
  useEffect(() => () => player.current?.stop(), []);
  return { state, line, start, pause, resume, stop };
}
