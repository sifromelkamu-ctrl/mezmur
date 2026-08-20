import { Mail } from "lucide-react";
import { haptics } from "../../utils/haptics";

interface EntryStepProps {
  onChooseEmail: () => void;
  onLogin: () => void;
}

export default function EntryStep({ onChooseEmail, onLogin }: EntryStepProps) {
  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-8">
        <div className="w-20 h-20 rounded-[22px] bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center mb-5 shadow-xl shadow-brand/25">
          <span className="text-3xl font-black text-black">M</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome to Mezmur</h2>
        <p className="text-sm text-fg-muted max-w-[28ch]">Ethiopian gospel music, wherever you are.</p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-fg-subtle uppercase tracking-wide text-center mb-1">
          Create your account
        </p>
        <button
          onClick={() => {
            haptics.light();
            onChooseEmail();
          }}
          className="flex items-center justify-center gap-2.5 bg-brand text-black font-bold rounded-full py-3.5 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-lg shadow-brand/20"
        >
          <Mail size={18} />
          Sign up with Email
        </button>

        <div className="flex items-center gap-3 my-1">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-fg-subtle">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <button onClick={onLogin} className="text-sm text-fg-muted hover:text-fg transition-colors text-center py-2">
          Already have an account? <span className="font-semibold text-fg">Log in</span>
        </button>
      </div>
    </div>
  );
}
