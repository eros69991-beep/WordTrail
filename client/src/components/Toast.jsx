import { useCallback, useState } from 'react';

export function useToastState() {
  const [messages, setMessages] = useState([]);
  const show = useCallback((text, type = 'ok') => {
    const id = Math.random();
    setMessages((m) => [...m, { id, text, type }]);
    setTimeout(() => setMessages((m) => m.filter((x) => x.id !== id)), 2600);
  }, []);
  return { messages, show };
}

export function ToastHost({ messages }) {
  return (
    <div className="fixed z-50 left-1/2 -translate-x-1/2 top-4 flex flex-col gap-2 items-center pointer-events-none w-[90vw] max-w-sm">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`px-4 py-2.5 rounded-xl shadow-lg text-sm ${m.type === 'error' ? 'bg-[#8b2c2c] text-white' : 'bg-ink text-white'}`}
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}
