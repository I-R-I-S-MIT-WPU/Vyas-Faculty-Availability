import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

// Must match the server (CODE_DIGITS in Vyas-Backend/controllers/userController.js).
export const CODE_LENGTH = 8;

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
}

// The emailed one-time code. `autoComplete="one-time-code"` lets phones offer the
// code straight from the email/keyboard; digits only; submits itself on the last digit.
export function CodeInput({ value, onChange, onComplete, disabled }: CodeInputProps) {
  return (
    <InputOTP
      maxLength={CODE_LENGTH}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      disabled={disabled}
      aria-label={`${CODE_LENGTH}-digit code`}
    >
      <InputOTPGroup>
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <InputOTPSlot key={i} index={i} className="w-9 sm:w-10" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
