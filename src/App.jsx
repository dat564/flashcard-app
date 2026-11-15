import { useCallback, useMemo, useState } from "react";
import { calcStreaks } from "./lib/stats";
import { todayKey } from "./lib/utils";
import { useProgress } from "./hooks/useProgress";
import { useTheme } from "./hooks/useTheme";
import { usePwaInstall } from "./hooks/usePwaInstall";
import { useSpeech } from "./hooks/useSpeech";
import { useDeck } from "./hooks/useDeck";
import { useStudySession } from "./hooks/useStudySession";
import { useQuiz } from "./hooks/useQuiz";
import Nav from "./components/Nav";
import Toast from "./components/Toast";
import StudyTab from "./components/study/StudyTab";
import LibraryTab from "./components/LibraryTab";
import MineTab from "./components/MineTab";
import StatsTab from "./components/StatsTab";
import "./styles/index.css";

export default function App() {
  const [progress, setProgress] = useProgress();
  const { theme, setTheme } = useTheme();
  const pwa = usePwaInstall();
  const speech = useSpeech();

  const [tab, setTab] = useState("study");
  const [toast, setToast] = useState("");
  const closeToast = useCallback(() => setToast(""), []);
  const [newLimit, setNewLimit] = useState(progress.settings?.newPerDay || 20);
  const [deckId, setDeckId] = useState(progress.settings?.activeDeck || "main");
  const today = todayKey();

  const data = useDeck({ progress, deckId, newLimit, today });
  const study = useStudySession({
    data,
    progress,
    setProgress,
    today,
    speech,
    deckId,
    newLimit,
    tab,
    setTab,
    setToast,
  });
  const quizApi = useQuiz({
    data,
    setProgress,
    today,
    speech,
    tab,
    setToast,
    beforeStart: () => {
      study.endSession();
      setTab("study");
    },
  });
  const streak = useMemo(() => calcStreaks(progress.stats), [progress.stats]);

  // Kết thúc mọi thứ đang chạy ở tab Học (phiên thẻ + quiz)
  const endAll = () => {
    study.endSession();
    quizApi.endQuiz();
  };
  const chooseDeck = (id) => {
    setDeckId(id);
    setProgress((p) => ({ ...p, settings: { ...p.settings, activeDeck: id } }));
    endAll();
  };

  return (
    <div className="app">
      <Nav tab={tab} setTab={setTab} theme={theme} setTheme={setTheme} />

      <main className={`main ${tab === "study" ? "main-study" : ""}`}>
        {tab === "study" && (
          <StudyTab
            study={study}
            quizApi={quizApi}
            data={data}
            speech={speech}
            deckId={deckId}
            chooseDeck={chooseDeck}
            setTab={setTab}
            newLimit={newLimit}
            streak={streak}
          />
        )}
        {tab === "library" && (
          <LibraryTab cards={data.cards} speak={speech.speak} />
        )}
        {tab === "mine" && (
          <MineTab
            lists={data.lists}
            cards={data.cards}
            isLearned={data.isLearned}
            deckId={deckId}
            setProgress={setProgress}
            setToast={setToast}
            chooseDeck={chooseDeck}
            setTab={setTab}
            speak={speech.speak}
          />
        )}
        {tab === "stats" && (
          <StatsTab
            progress={progress}
            setProgress={setProgress}
            data={data}
            speech={speech}
            theme={theme}
            setTheme={setTheme}
            pwa={pwa}
            streak={streak}
            newLimit={newLimit}
            setNewLimit={setNewLimit}
            today={today}
            setToast={setToast}
            endSession={endAll}
          />
        )}
      </main>

      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}
