import { useEffect, useState } from "react";
import { subscribeToasts } from "../toast";

export function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToasts((event) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const type = event?.detail?.type || "success";
      const message = event?.detail?.message || "Done";
      setItems((prev) => [...prev, { id, type, message }]);

      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, 2600);
    });

    return unsubscribe;
  }, []);

  return (
    <div className="toast-host" aria-live="polite" aria-atomic="true">
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.type}`}>
          {item.message}
        </div>
      ))}
    </div>
  );
}
