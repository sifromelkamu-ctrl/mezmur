import { Mail, Phone } from "lucide-react";
import { haptics } from "../../utils/haptics";

interface EntryStepProps {
  onChooseEmail: () => void;
  onChoosePhone: () => void;
  onLogin: () => void;
}

export default function EntryStep({ onChooseEmail, onChoosePhone, onLogin }: EntryStepProps) {
  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center py-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center mb-4 shadow-lg shadow-brand/20">
          <span className="text-2xl font-black text-black">M</span>
        </div>
        <h2 className="text-xl font-bold">Welcome to Mezmur</h2>
        <p className="text-sm text-fg-muted max-w-[26ch]">Ethiopian gospel music, wherever you are.</p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={() => {
            haptics.light();
            onChooseEmail();
          }}
          className="flex items-center justify-center gap-2.5 bg-brand text-black font-bold rounded-full py-3.5 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform"
        >
          <Mail size={18} />
          Continue with Email
        </button>
        <button
          onClick={() => {
            haptics.light();
            onChoosePhone();
          }}
          className="flex items-center justify-center gap-2.5 bg-panel text-fg font-bold rounded-full py-3.5 text-sm hover:bg-hover active:scale-[0.98] transition-all"
        >
          <Phone size={18} />
          Continue with Phone
        </button>

        <button
          onClick={onLogin}
          className="mt-2 text-sm text-fg-muted hover:text-fg transition-colors text-center py-2"
        >
          Already have an account? <span className="font-semibold text-fg">Log in</span>
        </button>
      </div>
    </div>
  );
}
