import { MessageComposer } from "./MessageComposer";

interface Props {
  onSend: (text: string) => void;
  onAttach?: (file: File) => void;
  onKeyStroke?: () => void;   // ← add this
  disabled?: boolean;
}

export function MessageInput({ onSend, onAttach, onKeyStroke, disabled }: Props) {
  return (
    <MessageComposer
      onSend={onSend}
      onAttach={onAttach}
      onKeyStroke={onKeyStroke}
      disabled={disabled}
    />
  );
}
