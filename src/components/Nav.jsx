import {
  BarChart3,
  Brain,
  FolderOpen,
  GraduationCap,
  Layers,
  Library,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";

const TABS = [
  ["study", "Học", Layers],
  ["exam", "Luyện thi", GraduationCap],
  ["library", "Kho từ", Library],
  ["mine", "Từ của tôi", FolderOpen],
  ["stats", "Thống kê", BarChart3],
];
const NEXT_THEME = { auto: "light", light: "dark", dark: "auto" };
const THEME_NAME = { auto: "tự động", light: "sáng", dark: "tối" };

export default function Nav({ tab, setTab, theme, setTheme }) {
  return (
    <header className="nav">
      <div className="brand">
        <span className="logo">
          <Brain size={20} />
        </span>
        <b>TOEIC Recall</b>
      </div>
      <nav className="tabs" aria-label="Điều hướng">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            className={tab === key ? "on" : ""}
            onClick={() => setTab(key)}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="nav-right">
        <button
          className="icon-btn"
          title={`Giao diện: ${THEME_NAME[theme]} (bấm để đổi)`}
          onClick={() => setTheme(NEXT_THEME[theme])}
        >
          {theme === "dark" ? (
            <Moon size={18} />
          ) : theme === "light" ? (
            <Sun size={18} />
          ) : (
            <Monitor size={18} />
          )}
        </button>
      </div>
    </header>
  );
}
