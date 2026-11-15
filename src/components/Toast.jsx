import { useEffect } from "react";
import { Check, X } from "lucide-react";

export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 2600);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;
  return (
    <div className="toast">
      <Check size={16} />
      {message}
      <button onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}
